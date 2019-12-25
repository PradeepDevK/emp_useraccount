'use strict';

let express = require('express'); 
let app = express();
let fs = require('fs');
let morgan = require('morgan');
let bodyParser = require('body-parser');
let helmet = require('helmet');
let compression = require('compression');
let session = require('express-session');
let redis   = require("redis");
let redisStore = require('connect-redis')(session);
let client  = redis.createClient();
let addRequestId = require('express-request-id')();
let moment = require('moment');
let mung = require('express-mung');
let winston = require('winston');
let appConfig = require("./config/serviceConfig");

//global varaiable
global.envConfig = require('../envConfig');
global.config = require('./config/app_config');
global.async = require('async');
global._  = require('underscore');
global.db = require('./models/db.js');
global.mysql = require('mysql');

let httpProtocol = (global.envConfig[global.envConfig.environmentName].appSSL.enabled ? require("https") : require("http"));

/**
* Specify a single subnet for trusted proxy.
**/
app.set('trust proxy', 'loopback');

/**
* Protects the application from some well known web vulnerabilities by setting HTTP headers appropriately.
**/
app.use(helmet());

/**
* Decrease the size of the response body to increase the speed of a web application.
**/
app.use(compression());

/**
 * Access control origin
 */
app.use(function(req, res, next) {
	var allowOrigin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Access-Control-Allow-Credentials", true);
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE');
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
	next();
});

/**
 * store session in redis
 */
app.use(session({
    secret: global.envConfig[global.envConfig.environmentName].redisConfig.secret,
    // Create new redis store.
    store: new redisStore({
        host: global.envConfig[global.envConfig.environmentName].redisConfig.host,
        port: global.envConfig[global.envConfig.environmentName].redisConfig.port,
        client: client,
        ttl: global.envConfig[global.envConfig.environmentName].redisConfig.ttl
    }),
    cookie: {
        secure: ((global.envConfig[global.envConfig.environmentName].appSSL.enabled) ? true : false)
    },
    saveUninitialized: false,
    resave: false
}));


if (global.SQLpool === undefined || global.SQLpool === null) {
    // Create a global sql pool connection.
    global.SQLpool = global.db.createPool();
    if (global.mysqlPool === undefined || global.mysqlPool === null) {
        global.mysqlPool = global.SQLpool;
    }
    // Reset connection thread object.
    global.connectionThreadId = {};
}

/**
 * Create access log stream.
 **/
var accessLogStream = fs.createWriteStream(__dirname + '/logs/access.log', {
    flags: 'a'
});

/**
 * Initialize access log writer.
 **/
if (global.envConfig.environmentName === 'production') {
    global.logger = new winston.Logger({
        transports: [
            new(winston.transports.File)({
                timestamp: function() {
                    return moment(new Date()).format("YYYY-MM-DDTHH:mm:ss");
                },
                formatter: function(options) {
                    return options.timestamp() + ' ' + options.level.toUpperCase() + ' ' + (undefined !== options.message ? options.message : '') + (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
                },
                colorize: true,
                name: 'access-file',
                stream: accessLogStream,
                handleExceptions: true,
                humanReadableUnhandledException: true,
                json: false
            })
        ],
        exitOnError: false
    });
} else {
    global.logger = new winston.Logger({
        transports: [
            new(winston.transports.Console)({
                timestamp: function() {
                    return moment(new Date()).format("YYYY-MM-DDTHH:mm:ss");
                },
                formatter: function(options) {
                    return options.timestamp() + ' ' + options.level.toUpperCase() + ' ' + (undefined !== options.message ? options.message : '') + (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
                },
                colorize: true,
                name: 'access-file',
                stream: accessLogStream,
                handleExceptions: true,
                humanReadableUnhandledException: true,
                json: false
            })
        ],
        exitOnError: false
    });
}

var serverLogStream = fs.createWriteStream(__dirname + '/logs/server.log', {
    flags: 'a'
});

/**
 * Define server log date format.
 **/
morgan.token('date', function(req, res) {
    return moment(new Date()).format("YYYY-MM-DDTHH:mm:ss");
});

/**
 * Define server log request headers to be written.
 **/
morgan.token('type', function(req, res) {
    return JSON.stringify(req.headers);
});

/**
 * Define server log UUID to be written.
 **/

morgan.token('uuid', function(req, res) {
    return "UUID=" + res._headers['x-request-id'];
});

/**
* Initialize response UUID.
**/
app.use(addRequestId);

/**
 * Initialize server log writer.
 **/
app.use(morgan(':remote-addr - :remote-user [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" \':type\' :uuid - :response-time ms', {
    stream: serverLogStream
}));

app.use(bodyParser.json({limit: '5mb'}));  

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(require('./controllers'));

/**
 * Default handler for invalid API endpoint.
 **/
app.all('*', function(req, res) {
    res.status(404).json({
        "responseCode": 1,
        "responseDesc": "Sorry, invalid request"
    });
});

/**
 * Default handler for uncaught exception error.
 **/
app.use(function(err, req, res, next) {
    global.logger.log("warn", "UncaughtException is encountered... " + err.stack);
    if (res.headersSent) {
        return next(err);
    }
    res.status(200).json({
        "responseCode": 1,
        "responseDesc": "Oops, something went wrong, please try again later"
    });
});

/**
 * To start express server with secure connection.
 **/
var httpServer = null;
if (global.envConfig[global.envConfig.environmentName].appSSL.enabled) {
    var credentials = null;
    try {
        var certificate = fs.readFileSync(global.envConfig[global.envConfig.environmentName].appSSL.cert, 'utf8');
        var privateKey = fs.readFileSync(global.envConfig[global.envConfig.environmentName].appSSL.key, 'utf8');
        credentials = {
            cert: certificate,
            key: privateKey
        };
    } catch (e) {
        throw new Error("Error reading the ssl files - " + JSON.stringify(e));
    }
    httpServer = httpProtocol.createServer(credentials, app);
} else {
    httpServer = httpProtocol.createServer(app);
}

httpServer.listen(appConfig[global.envConfig.environmentName].port, function() {
    global.logger.log('info', 'Watching on ' + appConfig[global.envConfig.environmentName].port + '...');
});