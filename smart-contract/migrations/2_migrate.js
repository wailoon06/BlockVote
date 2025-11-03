const voter_register = artifacts.require("voter_register");

module.exports = function (deployer) {
  deployer.deploy(voter_register);
};
