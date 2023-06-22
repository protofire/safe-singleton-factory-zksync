import * as zk from "zksync-web3";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import path from "path";
import { promises as filesystem } from 'fs'
import dotenv from "dotenv";

dotenv.config();

export async function submitFactoryContractTX(hre: HardhatRuntimeEnvironment) {

    const RPC = process.env.RPC;
    const MNEMONIC = process.env.MNEMONIC;
    const PK = process.env.PK;

    if (!RPC) {
    throw new Error('Missing RPC environment variable');
    }
    const provider = new zk.Provider(RPC);
    let wallet;
    //wallet = Wallet.createRandom();
    if (PK) {
    wallet = new zk.Wallet(PK).connect(provider);
    } else if (MNEMONIC) {
    wallet =  zk.Wallet.fromMnemonic(MNEMONIC).connect(provider);
    } else {
    throw new Error('Either PK or MNEMONIC environment variable must be set');
    }

    const chainId = (await provider.getNetwork()).chainId
	console.log({chainId})
	const filePath = path.join(__dirname, "..", "artifacts", `${chainId}`, "deployment.json")
	const deploymentData = JSON.parse(await filesystem.readFile(filePath, { encoding: 'utf8' }))
    const factoryAddress = deploymentData.address
    const bytecode = await wallet.provider.getCode(factoryAddress);

    if (bytecode == "0x") {

        process.stdout.write(`deploying create2 deployer contract (at ${factoryAddress})`);
        const sentTx = await wallet.provider.sendTransaction(deploymentData.transaction);
        process.stdout.write(` (tx: ${sentTx.hash})...\n`);
        await sentTx.wait();

        const receipt = await wallet.provider.getTransactionReceipt(sentTx.hash);
        const deployedAddress = receipt.contractAddress;

        if (deployedAddress !== factoryAddress) {
            console.table({ deployedAddress, factoryAddress });
            throw new Error("Failed to deploy deployer factory: deployed address is not the same as expected factory address");
        } else {
            console.log("factory contract deployed at", deployedAddress);
        }
    } else {
        process.stdout.write(`\tcreate2 deployer contract already deployed at ${factoryAddress}\n\n`);
    }
}

export default submitFactoryContractTX;
