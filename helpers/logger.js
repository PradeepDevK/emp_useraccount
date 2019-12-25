'use strict';

let winston = require('winston');
let moment = require('moment');
let fs = require('fs');

/**
* Create access log stream.
**/
var queryLogStream = fs.createWriteStream(__dirname+'/../logs/access.log', {flags : 'a'});

var logger = new winston.createLogger({
transports : [
    new (winston.transports.File)({
        timestamp : function() {
            return moment(new Date()).format("YYYY-MM-DDTHH:mm:ss");
        },
        formatter : function(options) {
            return options.timestamp() + ' ' + options.level.toUpperCase() + ' ' + (undefined !== options.message ? options.message : '') + (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
        },
        colorize: true,
        name : 'access-file',
        stream : queryLogStream,
        handleExceptions : true,
        humanReadableUnhandledException : true,
        json : false
    }),
    new winston.transports.Console({
      handleExceptions: true,
      humanReadableUnhandledException : true,
      json: false
    })
],
    exitOnError : false
});

if(global.envConfig.environmentName === 'production') {
    logger.remove(winston.transports.Console);
}

module.exports = logger;