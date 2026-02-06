const EncryptedVoting = artifacts.require("EncryptedVoting");

module.exports = function (deployer) {
  deployer.deploy(EncryptedVoting);
};
