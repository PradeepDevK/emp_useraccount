'use strict';
let express = require('express');
let router = express.Router();

router.use('/user', require('./userLogin'));

module.exports = router;