import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import * as hre from "hardhat";
import * as dotenv from "dotenv";
import * as ethers from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as zk from "zksync-web3";

const NONCE_HOLDER_SYSTEM_CONTRACT = "0x0000000000000000000000000000000000008003";
const NONCE_HOLDER_SYSTEM_CONTRACT_ABI = ["function getDeploymentNonce(address _address) external view returns (uint256 deploymentNonce)"];

dotenv.config();

async function signDeployFactoryContractTX() {
    const RPC = process.env.RPC;
    const MNEMONIC = process.env.MNEMONIC;
    const PK = process.env.PK;

    if (!RPC) {
        throw new Error('Missing RPC environment variable');
    }
    const provider = new zk.Provider(RPC);
    let wallet;
    if (PK) {
        wallet = new zk.Wallet(PK).connect(provider);
    } else if (MNEMONIC) {
        wallet = zk.Wallet.fromMnemonic(MNEMONIC).connect(provider);
    } else {
        throw new Error('Either PK or MNEMONIC environment variable must be set');
    }

    const fromAddress = wallet.address;

    const deployer = new Deployer(hre, wallet);
    const factoryArtifact = await deployer.loadArtifact("DeploymentFactory");

    const salt = ethers.constants.HashZero;
    const bytecodeHash = zk.utils.hashBytecode(factoryArtifact.bytecode);
    const input = "0x";
    const functionSelector = ethers.utils.solidityKeccak256(['string'], ['create(bytes32,bytes32,bytes)']).slice(0, 10);
    const encodedData = new ethers.utils.AbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes'],
        [salt, bytecodeHash, input]
    ).slice(2);
    const data = functionSelector + encodedData;

    const chainId = (await provider.getNetwork()).chainId;
    const nonce = await provider.getTransactionCount(fromAddress);

    const tempTx = {
        from: fromAddress,
        to: zk.utils.CONTRACT_DEPLOYER_ADDRESS,
        chainId,
        nonce,
        type: zk.utils.EIP712_TX_TYPE,
        customData: {
            factoryDeps: [factoryArtifact.bytecode],
            gasPerPubdata: ethers.BigNumber.from(zk.utils.DEFAULT_GAS_PER_PUBDATA_LIMIT),
        } as zk.types.Eip712Meta,
        value: ethers.utils.parseEther("0"),
        data,
    };
    const gasLimit = await provider.estimateGas(tempTx);
    const gasPrice = await provider.getGasPrice();

    const factoryTx = {
        ...tempTx,
        gasLimit: gasLimit.mul(2),
        gasPrice: gasPrice.mul(2),
    }

    const signedTxHash = zk.EIP712Signer.getSignedDigest(factoryTx);
    const signature = ethers.utils.arrayify(ethers.utils.joinSignature(wallet._signingKey().signDigest(signedTxHash)));
    factoryTx.customData = {
        ...factoryTx.customData,
        customSignature: signature,
    };
    const rawTx = zk.utils.serialize(factoryTx);

    // Getting the deployment nonce to calculate deployed factory address
    // Normally they should both be equal to 0, used for local testing purposes
    const nonceHolderContract = new ethers.Contract(NONCE_HOLDER_SYSTEM_CONTRACT, NONCE_HOLDER_SYSTEM_CONTRACT_ABI, wallet);
    const deploymentNonce = await nonceHolderContract.getDeploymentNonce(fromAddress);

    const contractAddress = zk.utils.createAddress(fromAddress, ethers.BigNumber.from(deploymentNonce));
    //const contractAddress2 = utils.create2Address(fromAddress, bytecodeHash, salt, input);

    let dir = path.join(__dirname, "..", "artifacts");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    dir = path.join(__dirname, "..", "artifacts", `${chainId}`);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    fs.writeFileSync(path.join(dir, "deployment.json"), JSON.stringify({
        gasPrice: factoryTx.gasPrice.toNumber(),
        gasLimit: factoryTx.gasLimit.toNumber(),
        signerAddress: factoryTx.from,
        transaction: rawTx,
        address: contractAddress
    }, null, 4) + '\n');
}

signDeployFactoryContractTX()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
