// ******
// Config
// ******

// Both client and server

Documents = new Meteor.Collection('documents');

// Custom permission check function

checkPermission = function(userId,doc) {
  return Meteor.user();	
}

// *******************
// Transactions config
// *******************

tx.collectionIndex = {'documents': Documents}; // This is compulsory for the transactions to work

tx.checkPermission = function(action,collection,doc,updates) { return checkPermission(Meteor.userId(),doc); }; // Note -- we're using the same function here that we use for our allow and deny rules

// ***
// App
// ***

Meteor.methods({
  'removeAll' : function() {
	tx.start('remove all documents');
	_.each(Documents.find({deleted:{$exists:false}}).fetch(), function(doc) {
	  tx.remove(Documents,doc);
	});
	tx.commit();  
  }
});

if (Meteor.isClient) {

  Accounts.ui.config({
	passwordSignupFields: 'USERNAME_ONLY'
  });

  Meteor.subscribe('documents');
  
  Session.setDefault('fieldBeingEdited',null);
  
  fieldNames = function() {
	var fieldNames = _.map(_.range(5), function(fieldNumber) { return {field: 'field' + (fieldNumber + 1), name:'Field ' + (fieldNumber + 1)}; });
	return fieldNames;  
  }
	
  Template.demo.helpers({
	'documents' : function() {
      return Documents.find({deleted:{$exists:false}});
	},
	'fieldNames' : function () {
	  return fieldNames();
	},
	'fields' : function() {
	  var self = this;
	  return _.map(fieldNames(), function(fieldName,index) {
		return {document_id:self._id,field:fieldName.field,value:self[fieldName.field] || ''};
	  });
	},
	'editing' : function() {
	  return Session.equals('fieldBeingEdited',this.document_id + '_' + this.field);	
	}
  });

  Template.demo.events({
    'click input#add-document': function (evt,tmpl) {
       tx.insert(Documents,{name:'Document ' + (Documents.find().count() + 1)});
    },
	'click input#edit-field': function (evt,tmpl) {
       evt.stopPropagation(); 
    },
	'click td.edit-field' : function (evt,tmpl) {
	   if (Meteor.user()) {
	     Session.set('fieldBeingEdited',this.document_id + '_' + this.field);
	     Deps.flush();
	     $('#edit-field').focus().select();
	   }
	},
	'keydown input#edit-field, focusout input#edit-field' : function(evt,tmpl) {
	  if (evt.type === 'keydown' && evt.which !== 13) {
		return;  
	  }
	  var val = $('input#edit-field').val();
	  if (val !== this.value) {
	    var modifier = {};
		modifier[this.field] = val;
	    tx.update(Documents,this.document_id,{$set:modifier});
	  }
	  Session.set('fieldBeingEdited',null);
	},
	'click .delete' : function() {
	  tx.remove(Documents,this._id);	
	},
	'click .delete-field' : function() {
	  var self = this;
	  var modifier = {};
	  modifier[self.field] = '';
	  tx.start('clear ' + this.name);
	  _.each(Documents.find({deleted:{$exists:false}}).fetch(),function(doc) {
		tx.update(Documents,doc,{$set:modifier});
	  });
	  tx.commit();
	},
	'click #delete-documents' : function() {
	  Meteor.call('removeAll'); // Because updates can only be done by _id and the transactions manager's remove is an update that isn't only by _id
	}
  });
}

if (Meteor.isServer) {
  
  Documents.allow({
	insert: function(userId,doc) { return checkPermission(userId, doc); },
	update: function(userId,doc, fields, modifier) { return checkPermission(userId, doc); },
	remove: function(userId,doc) { return checkPermission(userId, doc); }
  });
  
  Meteor.publish('documents',function() {
	return Documents.find(); 
  });
  
  // Clears out the transactions and documents collections every 24 hours -- DON'T PUT THIS IN YOUR APP!!!
  var MyCron = new Cron(360000);
  MyCron.addJob(24, function() {
    Documents.remove({});
	Transactions.remove({});
  });
  
}