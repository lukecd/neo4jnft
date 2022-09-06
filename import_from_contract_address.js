import { Network, Alchemy } from "alchemy-sdk";
import neo4j from "neo4j-driver";
import fs from "fs-extra";
import ethers from "ethers";

/**
 * @notice Adds a Contract node with the specified address
 * @param {*} alchemySession Alchemy Session
 * @param {*} neo4jSession Neo4J Session
 * @param {*} address Wallet address to add
 * @returns true if successful, false if command fails or if the Contract already exists
 */
async function addContract(alchemySession, neo4jSession, address) {
	try {
		// check if already exists
		if (await contractExists(neo4jSession, address)) return false;

		// doesn't exist, so add it
		// 1. get contract metadata
		// 2. use metadata to create our initial CONTRACT node representing the main contract
		const contractMetadata = await alchemySession.nft.getContractMetadata(address);
		const command = `CREATE (:Contract {title: '${contractMetadata.name}', symbol: '${contractMetadata.symbol}', address: '${address}', totalSupply: '${contractMetadata.totalSupply}'})`;

		console.log(command);
		const result = await neo4jSession.run(command);
		return true;
	} catch (error) {
		console.error(error);
		return false;
	}
}

/**
 * @notice Checks if a Contract node exists with the specific address.
 * @return True if exists, false otherwise
 * @param {*} neo4jSession Neo4J Session
 * @param {*} address Contract address to check
 */
async function contractExists(neo4jSession, address) {
	try {
		const command = `MATCH (c:Contract) WHERE c.address = '${address}' RETURN c `;
		const result = await neo4jSession.run(command);
		return result.records.length >= 1;
	} catch (error) {
		console.error(error);
		return false;
	}
}

/**
 * @notice Adds a Wallet node with the specified address
 * @param {*} neo4jSession Neo4J Session
 * @param {*} address Wallet address to add
 * @returns true if successful, false if command fails or if the wallet already exists
 */
async function addWallet(neo4jSession, address) {
	try {
		// check if already exists
		if (await walletExists(neo4jSession, address)) return false;
		// doesn't exist, so add it
		const command = `CREATE (:Wallet {address: '${address}'})`;
		console.log(command);
		const result = await neo4jSession.run(command);
		return true;
	} catch (error) {
		console.error(error);
		return false;
	}
}

/**
 * @notice Checks if a Wallet node exists with the specific address.
 * @return True if exists, false otherwise
 * @param {*} neo4jSession Neo4j Session
 * @param {*} address Contract address to check
 */
async function walletExists(neo4jSession, address) {
	try {
		const command = `MATCH (w:Wallet) WHERE w.address = '${address}' RETURN w `;
		const result = await neo4jSession.run(command);
		return result.records.length >= 1;
	} catch (error) {
		console.error(error);
		return false;
	}
}

/**
 * @notice Adds an OWNS relationship between the WALLET and CONTRACT.
 * If the address already exists, a duplicate is NOT added.
 * @param {*} neo4jSession Neo4j session
 * @param {*} contractAddress NFT contract address owned by wallet
 * @param {*} walletAddress Wallet address
 * @returns True if successful, false if either address does not exist
 */
async function addRelationship(neo4jSession, contractAddress, walletAddress) {
	try {
		// make sure the wallet and contract exist
		if (!(await contractExists(neo4jSession, contractAddress))) return false;
		if (!(await walletExists(neo4jSession, walletAddress))) return false;

		// they exist, so create a relationship
		const command = `MATCH (w), (c) WHERE w.address = "${walletAddress}" AND c.address= "${contractAddress}" MERGE (w)-[:OWNS]->(c);`;
		console.log(command);
		const result = await neo4jSession.run(command);
		return true;
	} catch (error) {
		console.error(error);
		return false;
	}
}

async function main() {
	let mainNFTContract = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"; // BAYC ERC-721 (Ethereum)
	// let mainNFTContract = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb"; // CryptoPunks Custom Contract (Ethereum)
	//let mainNFTContract = "0x60576a64851c5b42e8c57e3e4a5cf3cf4eeb2ed6"; // MintKudos ERC-721 (Polygon)

	mainNFTContract = ethers.utils.getAddress(mainNFTContract); // Checksum version

	// Alchemy config ETH
	const alchemySettingsETH = {
		apiKey: "bVfG0dkk7__qFgTBG1aeGpY58zuZ7_bE", // Replace with your Alchemy API Key.
		network: Network.ETH_MAINNET, // Replace with your network identifier
	};

	// Alchemy config Polygon
	const alchemySettingsPolygon = {
		apiKey: "0nnnXF5dcax3pa7bmCEZR0xy97lC4CoP", // Replace with your Alchemy API Key.
		network: Network.MATIC_MAINNET, // Replace with your network identifier
	};

	// Neo4J Config
	const neo4JSettings = {
		uri: "neo4j+s://2fce13e9.databases.neo4j.io", // Replace with your Neo4j URI
		user: "neo4j", // Replace with your Neo4j user
		password: "L8K5K8_CFmi3HKqvpvwhxUUmCjvjSLmRlKrG3B8PMDU", // Replace with your Neo4j password
	};

	// Neo4J Driver
	const driver = neo4j.driver(
		neo4JSettings.uri,
		neo4j.auth.basic(neo4JSettings.user, neo4JSettings.password),
	);

	// Neo4J Session
	const neo4JSession = driver.session({ database: "neo4j" });

	// Alchemy SDK
	const alchemySessionEth = new Alchemy(alchemySettingsETH);
	const alchemySessionPolygon = new Alchemy(alchemySettingsPolygon);

	// add the main contract
	await addContract(alchemySettingsETH, neo4JSession, mainNFTContract);

	// 1. get all owners for that contract and add them as WALLET nodes
	// 2. create an OWNS relationship between WALLETs -> CONTRACT
	const ownersForContract = await alchemySessionEth.nft.getOwnersForContract(mainNFTContract);
	const owners = ownersForContract.owners;

	// I decided to limit things to just the first 500 owners as it was too hard to
	// render more than about 10000 nodes.
	console.log("owner count=", owners.length);
	let ownerCount = owners.length;
	if (ownerCount > 500) ownerCount = 500;
	for (let i = 0; i <= ownerCount; i++) {
		console.log(`${i}:${ownerCount} adding owner`);
		const walletAddress = ethers.utils.getAddress(owners[i]);
		await addWallet(neo4JSession, walletAddress);
		await addRelationship(neo4JSession, mainNFTContract, walletAddress);
	}

	//3. again iterate over the owners, this time add in all contracts owned by that owner
	for (let i = 0; i <= ownerCount; i++) {
		try {
			console.log(`${i}:${ownerCount} getting NFTS owned by ${owners[i]}`);
			// Again I'm limiting the amount of data so I can render it properly
			const nftsOwnedByWallet = await alchemySessionEth.nft.getNftsForOwner(owners[i]);
			let nftOwnedCount = nftsOwnedByWallet.ownedNfts.length;
			if (nftOwnedCount > 20) nftOwnedCount = 20;
			for (let j = 0; j <= nftOwnedCount; j++) {
				const contractAddress = ethers.utils.getAddress(
					nftsOwnedByWallet.ownedNfts[j].contract.address,
				);
				const walletAddress = ethers.utils.getAddress(owners[i]);
				await addContract(alchemySessionEth, neo4JSession, contractAddress);
				await addRelationship(neo4JSession, contractAddress, walletAddress);
			}
		} catch (error) {
			console.error(error);
		}
	}

	// clean up
	await driver.close();
	await neo4JSession.close();

	console.log("i'm done");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
