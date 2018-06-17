// var express = require('express');
// var router = express.Router();
// var bodyParser = require('body-parser');
var jwt = require('jsonwebtoken');
// var https = require('https');
var request = require('request');
var xmlParser = require('xml2js').parseString;
var stripPrefix = require('xml2js').processors.stripPrefix;
var config = require('../config');


var User = require('../models/userModel').user;

// router.use(bodyParser.json());

/**
 * After the browser is redirected by the IDP, the frontend takes the ticket off the URL and sends a GET
 * request to the backend, here, with the ticket as a query parameter. Here, we validate the ticket against
 * the CAS server and then parse the response to see if we succeeded, and let the frontend know.
 */
const getAuth = (req, res) => {

    var ticket = req.query.ticket;
    console.log("This is the ticket: " + ticket)
    if (ticket) {
        // validate our ticket against the CAS server
        var url = `${config.CASValidateURL}?ticket=${ticket}&service=${config.thisServiceURL}`;
        request(url, (err, response, body) => {

            if (err) res.status(500).send();
            // parse the XML.
            // notice the second argument - it's an object of options for the parser, one to strip the namespace
            // prefix off of tags and another to prevent the parser from creating 1-element arrays.
            xmlParser(body, {
                tagNameProcessors: [stripPrefix],
                explicitArray: false
            }, function (err, result) {
                if (err) return res.status(500);
                serviceResponse = result.serviceResponse;
                var authSucceded = serviceResponse.authenticationSuccess;
                if (authSucceded) {
                    // see if this netID exists as a user already. if not, create one.
                    // Assume authSucceded.user is the netid
                    User.findOne({netid: authSucceded.user}, function (err, user) {
                        if (err) return res.status(500);
                        if (!user) {
                            return res.status(500);
                        }
                        else {
                            var token = jwt.sign({
                                data: authSucceded,
                                userID: user._id,
                                role: user.role
                            }, config.secret);
                            sendJSON(res, user._id, authSucceded.user, token);
                        }
                    });
                } else if (serviceResponse.authenticationFailure) {
                    res.status(401).json({success: false, message: 'CAS authentication failed'});
                } else {
                    res.status(500).send();
                }
            })
        })
    } else {
        return res.status(400).send();
    }
}


var sendJSON = function (res, userID, username, token) {
    // send our token to the frontend! now, whenever the user tries to access a resource, we check their
    // token by verifying it and seeing if the payload (the username) allows this user to access
    // the requested resource.
    // res.status(200).json({success: true, message: 'CAS Authentication Succeeded', user: {netid: username, token: token}});
    res.json({
        success: true,
        message: 'CAS authentication success',
        user: {
            username: username,
            userID: userID,
            token: token
        }
    });
};

const getRole = (req, res) => {
    var token = req.params.token;
    jwt.verify(token, config.secret, (err, decoded) => {
        if (err) {
            res.send("Error Occurred");
        }
        var role = decoded.role;
        res.send(role);
    })
}

module.exports = app => {
    app.get('/api/auth', getAuth)
    app.get('/api/auth/role/:token', getRole)
}
