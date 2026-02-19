// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {DepositLogic} from "../src/DepositLogic.sol";
import {WalletFactory} from "../src/WalletFactory.sol";

contract Deploy is Script {
    struct Deployment {
        uint256 chainId;
        address deployer;
        address owner;
        address treasury;
        address depositLogic;
        address walletFactory;
        uint256 deployedAt;
    }

    function run() external returns (Deployment memory deployment) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address owner = vm.envOr("FACTORY_OWNER", deployer);
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        DepositLogic depositLogic = new DepositLogic();
        WalletFactory walletFactory = new WalletFactory(address(depositLogic), owner, treasury);

        vm.stopBroadcast();

        deployment = Deployment({
            chainId: block.chainid,
            deployer: deployer,
            owner: owner,
            treasury: treasury,
            depositLogic: address(depositLogic),
            walletFactory: address(walletFactory),
            deployedAt: block.timestamp
        });

        _saveDeployment(deployment);
    }

    function _saveDeployment(Deployment memory deployment) internal {
        string memory root = vm.projectRoot();
        string memory addressesDir = string.concat(root, "/addresses");
        vm.createDir(addressesDir, true);

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", deployment.chainId);
        vm.serializeAddress(key, "deployer", deployment.deployer);
        vm.serializeAddress(key, "owner", deployment.owner);
        vm.serializeAddress(key, "treasury", deployment.treasury);
        vm.serializeAddress(key, "depositLogic", deployment.depositLogic);
        vm.serializeAddress(key, "walletFactory", deployment.walletFactory);
        string memory json = vm.serializeUint(key, "deployedAt", deployment.deployedAt);

        string memory chainFile = string.concat(addressesDir, "/", vm.toString(deployment.chainId), ".json");
        string memory latestFile = string.concat(addressesDir, "/latest.json");

        vm.writeJson(json, chainFile);
        vm.writeJson(json, latestFile);
    }
}
