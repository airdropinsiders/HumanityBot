import Web3 from 'web3';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import config from './config.js';

function displayHeader() {
    console.log(`
        █████╗ ██╗██████╗ ██████╗ ██████╗  ██████╗ ██████╗ 
       ██╔══██╗██║██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██╔══██╗
       ███████║██║██████╔╝██║  ██║██████╔╝██║   ██║██████╔╝
       ██╔══██║██║██╔══██╗██║  ██║██╔══██╗██║   ██║██╔═══╝ 
       ██║  ██║██║██║  ██║██████╔╝██║  ██║╚██████╔╝██║     
       ╚═╝  ╚═╝╚═╝╚═╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     
                                                           
       ██╗███╗   ██╗███████╗██╗██████╗ ███████╗██████╗     
       ██║████╗  ██║██╔════╝██║██╔══██╗██╔════╝██╔══██╗    
       ██║██╔██╗ ██║███████╗██║██║  ██║█████╗  ██████╔╝    
       ██║██║╚██╗██║╚════██║██║██║  ██║██╔══╝  ██╔══██╗    
       ██║██║ ╚████║███████║██║██████╔╝███████╗██║  ██║    
       ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝    
       `)
    console.log(chalk.yellow('  📢  Telegram Channel: https://t.me/ksqxszq'));
    console.log();  // Add extra empty line for separation
}

// Blockchain connection setup
async function setupBlockchainConnection(rpcUrl) {
    const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));

    try {
        const blockNumber = await web3.eth.getBlockNumber();
        console.log(chalk.green(`Successfully connected to Humanity blockchain. Current block number: ${blockNumber}`));
    } catch (error) {
        console.log(chalk.red('Connection failed:', error.message));
        process.exit(1);  // Exit if connection fails
    }

    return web3;
}

// Load private keys from file
function loadPrivateKeys(filePath) {
    const privateKeys = fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .filter(line => line.trim() !== ''); // Remove empty lines
    return privateKeys;
}

// Check if rewards can be claimed
async function claimRewards(privateKey, web3, contract) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const senderAddress = account.address;
        const genesisClaimed = await contract.methods.userGenesisClaimStatus(senderAddress).call();
        const currentEpoch = await contract.methods.currentEpoch().call();
        const { bufferAmount, claimStatus } = await contract.methods.userClaimStatus(senderAddress, currentEpoch).call();

        if (genesisClaimed && !claimStatus) {
            console.log(chalk.green(`Claiming rewards for address ${senderAddress} (Genesis reward already claimed).`));
            await processClaim(senderAddress, privateKey, web3, contract);
        } else if (!genesisClaimed) {
            console.log(chalk.green(`Claiming rewards for address ${senderAddress} (Genesis reward not yet claimed).`));
            await processClaim(senderAddress, privateKey, web3, contract);
        } else {
            console.log(chalk.yellow(`Address ${senderAddress} has already claimed rewards in epoch ${currentEpoch}. Skipping.`));
        }

    } catch (error) {
        handleError(error, privateKey);
    }
}

// Error handling with detailed information
function handleError(error, privateKey) {
    const errorMessage = error.message || error.toString();
    if (errorMessage.includes('Rewards: user not registered')) {
        console.log(chalk.red(`Error: User ${privateKey} is not registered.`));
    } else {
        console.log(chalk.red(`Failed to claim rewards for address ${privateKey}. Error: ${errorMessage}`));
    }
}

// Process reward claim transaction
async function processClaim(senderAddress, privateKey, web3, contract) {
    try {
        const gasAmount = await contract.methods.claimReward().estimateGas({ from: senderAddress });
        const transaction = {
            to: contract.options.address,
            gas: gasAmount,
            gasPrice: await web3.eth.getGasPrice(),
            data: contract.methods.claimReward().encodeABI(),
            nonce: await web3.eth.getTransactionCount(senderAddress),
            chainId: 1942999413,  // Set the correct chainId
        };

        const signedTxn = await web3.eth.accounts.signTransaction(transaction, privateKey);
        const txHash = await web3.eth.sendSignedTransaction(signedTxn.rawTransaction);
        console.log(chalk.green(`Transaction successful for address ${senderAddress}. Transaction hash: ${txHash.transactionHash}`));

    } catch (error) {
        console.log(chalk.red(`Error processing claim for address ${senderAddress}: ${error.message}`));
    }
}

// Main execution function
async function main() {
    displayHeader();
    const rpcUrl = config.rpcUrl || 'https://rpc.testnet.humanity.org'; // Use RPC address from config or default URL
    const web3 = await setupBlockchainConnection(rpcUrl);
    
    const contract = new web3.eth.Contract(config.contractAbi, config.contractAddress);

    // Loop every 6 hours
    while (true) {
        const privateKeys = loadPrivateKeys(config.privateKeysFile || './private_keys.txt'); // Specify file path or use default
        for (const privateKey of privateKeys) {
            await claimRewards(privateKey, web3, contract);
        }

        console.log(chalk.cyan('Waiting 6 hours before running again...'));
        await new Promise(resolve => setTimeout(resolve, 6 * 60 * 60 * 1000)); // Wait 6 hours
    }
}

main().catch(error => console.error(chalk.red('Error in main program execution:', error)));
