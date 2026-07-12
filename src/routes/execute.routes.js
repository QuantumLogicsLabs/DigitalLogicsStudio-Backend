const express = require("express");
const { execute } = require("../controllers/execute.controller");

const router = express.Router();

router.post("/", execute);

module.exports = router;
