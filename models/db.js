'use strict';
var mysql = require("mysql");
var fs = require('fs');

/**
 * Defines database operations.
 * @class
 */
var DB = function(){};

DB.prototype.createPool = function(){
    var sslOptions = false;
    if(global.envConfig[global.envConfig.environmentName].mysqlSSL.enabled) {
        try {
            var ca = fs.readFileSync(global.envConfig[global.envConfig.environmentName].mysqlSSL.ca, 'utf8');
            var certificate = fs.readFileSync(global.envConfig[global.envConfig.environmentName].mysqlSSL.cert, 'utf8');
            var privateKey  = fs.readFileSync(global.envConfig[global.envConfig.environmentName].mysqlSSL.key, 'utf8');
            sslOptions = {"ca" : ca, "cert" : certificate, "key" : privateKey};
        } catch(e) {
            throw new Error("Error reading mysql ssl files - " + JSON.stringify(e));
        }
    }
    return mysql.createPool({
        host     : global.envConfig[global.envConfig.environmentName].mysqlConfig.host,
        user     : global.envConfig[global.envConfig.environmentName].mysqlConfig.user,
        password : global.envConfig[global.envConfig.environmentName].mysqlConfig.password,
        ssl : sslOptions,
        connectionLimit : global.envConfig[global.envConfig.environmentName].mysqlConfig.connectionLimit
    });
};

/**
 * Establishes mysql connection and returns the connection object.
 * @function
 * @param {object} pool - Mysql pool object.
 * @param {function} callback - Callback.
 */
DB.prototype.getConnection = function(pool,callback){
    pool.getConnection(function(err, connection) {
        if(err) {
            //logging here
            global.logger.error({"Error " : err, "Message " : "Error connection to sql pool"});
            callback('Error connecting to sql pool');
            return;
        }
        if(global.connectionThreadId[connection.threadId] === undefined) {
            global.connectionThreadId[connection.threadId] = "0";
            connection.on('error', function(err) {
                if(err.code === "PROTOCOL_CONNECTION_LOST") {
                    connection.destroy();
                } else {
                    connection.release();
                    global.logger.error({'Message': 'Sql connection error', errorData: JSON.stringify(err), stackTrace:err.stack});
                }
                return;
            });
        }
        callback(null,connection);
    });
};

/**
 * Establishes mysql connection, begins transaction and returns the transactio connection object.
 * @function
 * @param {object} pool - Mysql pool object.
 * @param {function} callback - Callback.
 */
DB.prototype.createTransaction = function(pool,callback) {
    var self = this;
    self.getConnection(pool,function(err,connection){
        if(err) {
            //logging here
            global.logger.error({"Error " : err, "Message " : "Error connecting to sql pool"});
            callback('Error connecting to sql pool');
            return;
        }
        connection.beginTransaction(function(err) {
            if(err){
                global.logger.error({"Error " : err, "Message " : "Error in beginning transaction"});
                callback('Error in beginning transaction');
                return;
            }
            callback(null,connection);
        });
    });
};

/**
* Returns the SQL transaction connection object for an instance.
* @param {Object} self Instance data of a class.
* @param {cb} callback The callback that handles the response.
**/
DB.prototype.getTransactionConnection = function(self, callback) {
    var objInstance = this;
    objInstance.uuid = self.uuid;
    self.transactionConnection = null;
    objInstance.createTransaction(global.SQLpool, function(err, transactionConnection) {
       if(err) {
           callback(err, null);
           return;
       }
       self.transactionConnection = transactionConnection;
       callback(null, self);
    });
};

/**
 * Establishes mysql connection, executes query, releases connection, returns response.
 * @function
 * @param {string} query - Query to be executed.
 * @param {array} inserts - Array data to format the query with.
 * @param {function} callback - Callback.
 */
DB.prototype.getConnectionExeQuery = function(query, inserts, callback) {
    var self = this;
    self.getConnection(global.SQLpool, function(err, connection){
        if(err) {
            return callback(err);
        }
        var formatedQuery = connection.query(query, inserts, function(err, rows) {
            connection.release();
            if(err) {
                global.logger.error({message:'Error in executing query', query: formatedQuery.sql, errorData: JSON.stringify(err)});
                return callback(err);
            }
            callback(null, rows);
        });
    });
};

module.exports = new DB();
