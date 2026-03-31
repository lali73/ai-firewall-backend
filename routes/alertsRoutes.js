const express = require("express");
const { receiveGatewayAlert } = require("../controllers/alertsController");

const router = express.Router();

router.post("/", receiveGatewayAlert);

module.exports = router;
