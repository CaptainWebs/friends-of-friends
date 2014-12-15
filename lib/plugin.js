/**
 * @module plugin
 */

var debug = require('debug')('friends-of-friends:plugin'),
    Friendship = require('./friendship'),
    mongoose = require('mongoose'),
    privacy = require('./privacy'),
    relationships = require('./relationships');

/**
 * the mongoose plugin function
 * @type {Function}
 */
module.exports = friendshipPlugin;

/**
 * adds friends-of-friends functionality to an existing Schema
 * @param  {Schema} AccountSchema - The mongoose Schema that gets plugged
 * @param  {Object} options       - Options passed to the plugin
 */
function friendshipPlugin (AccountSchema, options) {

    /**
     * default definition of a privacy field
     * @type {Object}
     */
    var settingDef = { 
        type: Number, 
        min: privacy.values.ANYBODY, 
        max: privacy.values.NOBODY, 
        default: options.privacyDefault 
    };

    // add privacy preferences
    AccountSchema.add({
        privacy: {
            profile:        settingDef,
            search:         settingDef,
            chatRequests:   settingDef,
            friendRequests: settingDef,
        }
    });

    /*
     * Most of these require or may optionally take a callback with this signature:
     *  function (err, friends) {...}
     * 
     * example:
     * 
     *  Model.getFriends(account1_Id, function (err, friends) {
     *      
     *      console.log('friends', friends);
     *  
     *  });
     */
    
    /**
     * @class AccountModel
     */
    
    /**
     * default privacy constants
     * @member      privacy
     * @memberOf    AccountModel
     * @constant
     * @type        {Object}
     * @see         [Privacy]{@link module:plugin}
     */
    AccountSchema.statics.privacy = privacy;

    /**
     * default relationship constants 
     * @member      relationships
     * @memberOf    AccountModel
     * @constant
     * @type        {Object}
     * @see         [Relationships]{@link module:relationships}
     */
    AccountSchema.statics.relationships = relationships;

    /**
     * sends a friend request to a another user
     * @function    AccountModel.friendRequest
     * @param       {ObjectId} requesterId    - the ObjectId of the account sending the request
     * @param       {ObjectId} requested_Id   - the ObjectId of the account to whom the request will be sent
     * @param       {Function} done           - required callback, passed the populated request 
     */
    AccountSchema.statics.friendRequest = function (requesterId, requestedEmail, done) {
        debug('friendRequest()');

        var self = this,
            model = mongoose.model(options.modelName, AccountSchema);

        // view the user's profile to see what we can do
        this.viewProfile(requesterId, requestedEmail, function (err, requestedAccountInfo) {
            if (err) {
                done(err);
            } else if (!requestedAccountInfo) {
                done();
            } else {

                // check for existing friendship or request
                self.getFriendship(requesterId, requestedAccountInfo._id, function (err, friendship) {
                    if (err) {
                        done(err);
                    } else if (friendship) {
                        var err = (friendship.status === 'Pending')
                            ? 'A pending request already exists'
                            : 'Cannot request friendship of friends';
                        done(err, populatedFriendship);
                    } else {
                        // check to see if they are NOT allowed to send a request
                        if (!requestedAccountInfo.friendRequests) {
                            done(new Error('You are not allowed to send this user a friend request.'));
                            debug('friend request no allowed!');
                        } else {
                            var request = new Friendship({ 
                                requester: requesterId,
                                requested: requestedAccountInfo._id
                            }).save(done);
                        }
                    }
                });
            }
        });
    };

    /**
     *  get all friend requests for a given user
     * @function    AccountModel.getRequests
     * @param       {ObjectId} accountId  - the _id of the user
     * @param       {Function} done       - required callback, passed requests retrieved
     */
    AccountSchema.statics.getRequests = function (accountId, done) {
        debug('getRequests')
        var model = mongoose.model(options.modelName, AccountSchema), 
            select = '_id created email privacy profile.displayName';

        Friendship.getRequests(accountId, function (err, requests) {
            if (err) {
                done(err)
            } else if (requests) {
                model.populate(requests, [
                    { path: 'requester', select: select },
                    { path: 'requested', select: select }
                ], done);
            } else {
                done();
            }
        });
    };

    /**
     *  get requests the given user has sent
     * @function    AccountModel.getSentRequests
     * @param       {ObjectId} accountId    - the _id of the user
     * @param       {Function} done         - required callback, passed sent requests retrieved 
     */
    AccountSchema.statics.getSentRequests = function (accountId, done) {
        debug('getSentRequests')

        var model = mongoose.model(options.modelName, AccountSchema), 
            select = '_id created email privacy profile.displayName';

        Friendship.getSentRequests(accountId, function (err, sentRequests) {
            if (err) {
                done(err)
            } else if (sentRequests) {
                model.populate(sentRequests, [
                    { path: 'requester', select: select },
                    { path: 'requested', select: select }
                ], done);
            } else {
                done();
            }
        })
    };

    /**
     *  get requests received by the given user
     * @function    AccountModel.getReceivedRequests
     * @param {ObjectId} accountId - the _id of the user
     * @param {Function} done - required callback, passed received requests retrieved
     */
    AccountSchema.statics.getReceivedRequests = function (accountId, done) {
        debug('getReceivedRequests')

        var model = mongoose.model(options.modelName, AccountSchema),
            select = '_id created email privacy profile.displayName';

        Friendship.getReceivedRequests(accountId, function (err, receivedRequests) {
            if (err) {
                done(err);
            } else if (receivedRequests) {
                model.populate(receivedRequests, [
                    { path: 'requester', select: select },
                    { path: 'requested', select: select }
                ], done);
            } else {
                done();
            }
        });
    };

    /**
     *  accept a friend request 
     * @function    AccountModel.acceptRequest
     * @param       {ObjectId} requesterId  - the _id of the requester of friendship
     * @param       {ObjectId} requestedId  - the _id of the user whose friendship was requested
     * @param       {Function} done         - required callback, passed the populated friendship accepted
     */
    AccountSchema.statics.acceptRequest = function (requesterId, requestedId, done) {
        debug('acceptRequest')

        var model = mongoose.model(options.modelName, AccountSchema),
            select = '_id created email privacy profile';

        Friendship.acceptRequest(requestedId, requesterId, function (err, friendship) {
            if (err) {
                throw err
                done(err);
            } else if (friendship) {
                model.populate(friendship, [
                    { path: 'requester', select: select },
                    { path: 'requested', select: select }
                ], done);
            } else {
                done('Request does not exist!');
            }

        });
    };

    /**
     *  deny a friend request
     * @function    AccountModel.denyRequest
     * @param       {ObjectId} requesterId  - the _id of the requester of friendship
     * @param       {ObjectId} requestedId  - the _id of the user whose friendship was requested
     * @param       {Function} done         - required callback, passed the denied friendship
     */
    AccountSchema.statics.denyRequest = Friendship.denyRequest;

    /**
     *  get all friends of an account
     * @function    AccountModel.getFriends
     * @param       {ObjectId} accountId    - the _id of the account
     * @param       {Function} done         - required callback, passed an array of friends
     */
    AccountSchema.statics.getFriends = function (accountId, done) {
        debug('getFriends')

        var self = this,
            model = mongoose.model(options.modelName, AccountSchema),
            friends = [];

        var select = '_id created email privacy profile';

        Friendship.getFriends(accountId, function (err, friendIds) {
            if (err) {
                done(err);
            } else {
                model.find({ '_id' : { '$in': friendIds } }, done);
            }
        });
    };

    /**
     *  get friends of this account's friends
     * @function    AccountModel.getFriendsOfFriends
     * @param       {ObjectId} accountId    - the _id of the account
     * @param       {Function} done         - required callback, passed an array of friendsOfFriends
     */
    AccountSchema.statics.getFriendsOfFriends = function (accountId, done) {
        debug('getFriendsOfFriends')

        var friendsOfFriends = [],
            friendResults = 0,
            model = mongoose.model(options.modelName, AccountSchema);

        // get the specified user's friends
        Friendship.getFriendsOfFriends(accountId, function (err, friendIdsOfFriends) {
            if (err) {
                done(err);
            } else {
                model.find({ '_id' : { '$in': friendIdsOfFriends } }, done);
            }
        });
    };

    /**
     *  determine if accountId2 is a friend of accountId1
     * @function    AccountModel.isFriend
     * @param       {ObjectId} accountId1   - the _id of account1
     * @param       {ObjectId} accountId2   - the _id of account2
     * @param       {Function} done         - required callback, passed a boolean determination
     */
    AccountSchema.statics.isFriend = Friendship.isFriend;

    /**
     *  determine if accountId1 and accountId2 have any common friends
     * @function    AccountModel.isFriendOfFriends
     * @param       {ObjectId} accountId1   - the _id of account1
     * @param       {ObjectId} accountId2   - the _id of account2
     * @param       {Function} done         - required callback, passed a boolean determination
     */
    AccountSchema.statics.isFriendOfFriends = Friendship.isFriendOfFriends;

    /**
     *  get the friendship document itself
     * @function    AccountModel.getFriendship
     * @param       {ObjectId} accountId1   - the _id of account1
     * @param       {ObjectId} accountId2   - the _id of account2
     * @param       {Function} done         - required callback, passed err and a Friendship document, if found
     */
    AccountSchema.statics.getFriendship = function (accountId1, accountId2, done) {
        debug('getFriendship')

        var model = mongoose.model(options.modelName, AccountSchema);

        var conditions = {
            '$or': [
                { requester: accountId1, requested: accountId2 },
                { requester: accountId2, requested: accountId1 }
            ],
            status: 'Accepted'
        };

        var select = '_id created email privacy profile';

        Friendship.findOne(conditions, function (err, friendship) {
            model.populate(friendship, [
                { path: 'requester', select: select },
                { path: 'requested', select: select }
            ], done);
        });
    };

    /**
     *  determine the relationship between two users
     * @function    AccountModel.getRelationship
     * @param       {ObjectId} accountId1   - the _id of account1
     * @param       {ObjectId} accountId2   - the _id of account2
     * @param       {Function} done         - required callback, passed err and a Relationship value
     */
    AccountSchema.statics.getRelationship = Friendship.getRelationship;

    

    /**
     *  Document-accessible properties and methods
     * 
     * these instance methods are aliases of the Model statics as they apply to each document
     * 
     * example:
     *  var user = new Accounts({...});
     *  user.sendRequest(requestedEmail, function (err, request) {...})
     *  
     *  @class AccountDocument
     */
   
    /**
     *  send a request to another account
     * @function    AccountDocument.friendRequest
     * @param       {ObjectId} requestedEmail   - the _id of the account to whom the request will be sent
     * @param       {Function} done             - required callback, passed the populated request sent 
     */
    AccountSchema.methods.friendRequest = function (email, done) {
        AccountSchema.statics.friendRequest(this._id, email, done);
    };

    /**
     *  get friend requests
     * @function    AccountDocument.getRequests
     * @param       {Function} done - required callback, passed the populated requests retrieved
     */
    AccountSchema.methods.getRequests = function (done) {
        AccountSchema.statics.getRequests(this._id, done);
    };

    /**
     * get friend requests the user has sent
     * @function    AccountDocument.getSentRequests
     * @param       {Function} done - required callback, passed the populated requests retrieved
     */
    AccountSchema.methods.getSentRequests = function (done) {
        AccountSchema.statics.getSentRequests(this._id, done);
    };

    /**
     *  get friend requests the user has received
     * @function    AccountDocument.getReceivedRequests
     * @param       {Function} done - required callback, passed the populated requests retrieved
     */
    AccountSchema.methods.getReceivedRequests = function (done) {
        AccountSchema.statics.getReceivedRequests(this._id, done);
    };

    /**
     *  accept a friend request received from the specified user
     * @function    AccountDocument.acceptRequest
     * @param       {ObjectId} requesterId  - the _id of the account from whom the request was received
     * @param       {Function} done         - required callback, passed the populated request that was accepted
     */
    AccountSchema.methods.acceptRequest = function (requesterId, done) {

        AccountSchema.statics.acceptRequest(requesterId, this._id, done);
    };

    /**
     *  deny a friend request received from the specified user
     * @function    AccountDocument.denyRequest
     * @param       {ObjectId} requesterId  - the _id of the account from whom the request was received
     * @param       {Function} done         - required callback, passed the populated request that was denied
     */
    AccountSchema.methods.denyRequest = function (requesterId, done) {
        AccountSchema.statics.denyRequest(requesterId, this._id, done);
    };

    /**
     *  get this document's friends
     * @function    AccountDocument.getFriends
     * @param       {Function} done - required callback, passed an array of friends
     */
    AccountSchema.methods.getFriends = function (done) {
        AccountSchema.statics.getFriends(this._id, done);
    };

    /**
     *  get friends of this document's friends
     * @function    AccountDocument.getFriendsOfFriends
     * @param       {Function} done - required callback, passed an array of friendsOfFriends
     */
    AccountSchema.methods.getFriendsOfFriends = function (done) {
        AccountSchema.statics.getFriendsOfFriends(this._id, done);
    };

    /**
     *  determine if this document is friends with the specified account
     * @function    AccountDocument.isFriend
     * @param       {ObjectId} accountId    - the _id of the user to check for friendship
     * @param       {Function} done         - required callback, passed a boolean determination
     */
    AccountSchema.methods.isFriend = function (accountId, done) {
        AccountSchema.statics.isFriend(this._id, accountId, done);
    };

    /**
     *  determine if this document shares any friends with the specified account
     * @function    AccountDocument.isFriendOfFriends
     * @param       {ObjectId} accountId    - the _id of the user to check for friendship
     * @param       {Function} done         - required callback, passed a boolean determination
     */
    AccountSchema.methods.isFriendOfFriends = function (accountId, done) {
        AccountSchema.statics.isFriendOfFriends(this._id, accountId, done);
    };

    /**
     *  get the friendship document of this document and the specified account
     * @function    AccountDocument.getFriendship
     * @param       {ObjectId} accountId    - the _id of the friend
     * @param       {Function} done         - required callback, passed the populated friendship
     */
    AccountSchema.methods.getFriendship = function (accountId, done) {
        AccountSchema.statics.getFriendship(this._id, accountId, done);
    };

    /**
     *  get the relationship of this document and the specified account
     * @function    AccountDocument.getRelationship
     * @param       {ObjectId} accountId    - the _id of the friend
     * @param       {Function} done         - required callback, passed the relationship value
     */
    AccountSchema.methods.getRelationship = function (accountId, done) {
        AccountSchema.statics.getRelationship(this._id, accountId, done);
    };
};