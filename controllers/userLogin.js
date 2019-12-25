"use strict";

let { google } = require('googleapis');
let express = require('express');
let router = express.Router();
let OAuth2Data = require('../config/google_key.json');

let CLIENT_ID = OAuth2Data.client.id;
let CLIENT_SECRET = OAuth2Data.client.secret;
let REDIRECT_URL = OAuth2Data.client.redirect


/**
 * Gmail login
 * @param req Contains the request object.
 * @param res Contains the response object.
 */
router.get('/gmail/login', function (req, res) {
    let oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL)
    let authed = false;

    if (!authed) {
        // Generate an OAuth URL and redirect there
        let url = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: 'https://www.googleapis.com/auth/gmail.readonly'
        });
        console.log(url)
        res.redirect(url);
    } else {
        let gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        gmail.users.labels.list({
            userId: 'me',
        }, (err, res) => {
            if (err) return console.log('The API returned an error: ' + err);
            let labels = res.data.labels;
            if (labels.length) {
                console.log('Labels:');
                labels.forEach((label) => {
                    console.log(`- ${label.name}`);
                });
            } else {
                console.log('No labels found.');
            }
        });
        res.json({ "responseCode": 0, "responseDesc": 'Logged in' });
    }
});

/**
 * Gmail login auth callback
 * @param req Contains the request object.
 * @param res Contains the response object.
 */
router.get('/auth/google/callback', function (req, res) {
    let oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL)
    let authed = false;

    const code = req.query.code
    if (code) {
        // Get an access token based on our OAuth code
        oAuth2Client.getToken(code, function (err, tokens) {
            if (err) {
                console.log('Error authenticating')
                console.log(err);
            } else {
                console.log('Successfully authenticated');
                oAuth2Client.setCredentials(tokens);
                authed = true;
                console.log(req.user);
                res.redirect('/user/logout');
            }
        });
    }
});

/**
 * User login
 * @param req Contains the request object.
 * @param res Contains the response object.
 */
router.post('/')

/**
 * Get User session
 * @param req Contains the request object.
 * @param res Contains the response object.
 */
router.post('/session', function (req, res) {
});

/**
 * User logout api
 * @param req Contains the request object.
 * @param res Contains the response object.
 */
router.get('/logout', function (req, res) {
    res.clearCookie('connect.sid', { path: '/' });
    req.session.destroy(function (err) {
        if (err) {
            return res.json({ 'responseCode': global.config.default_error_code, 'responseDesc': err });
        }
        return res.json({ 'responseCode': global.config.default_success_code, 'responseDesc': 'Succesfully logged out' });
    });
});

module.exports = router;