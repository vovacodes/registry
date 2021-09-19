const process = require("node:process");
const {
  Keypair,
  PublicKey,
  Connection,
  clusterApiUrl,
} = require("@solana/web3.js");
const {
  Idl,
  Provider,
  Wallet,
  Program,
  utils,
  web3,
} = require("@project-serum/anchor");

/** @type {Idl} */
const idl = require("./idl/registry.json");

const REGISTRY_PROGRAM_ID = new PublicKey(
  "Hmo7aZ3yDGYiNsme2sFfhHqrbh6x8QuqXmWeVQtqYwGa"
);

const ORACLE_KEYPAIR = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.KEYPAIR))
);

/**
 * Responds to any HTTP request.
 *
 * @param {import('express').Request} req HTTP request context.
 * @param {import('express').Response} res HTTP response context.
 */
exports.githubOracle = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("This endpoint supports only POST requests.");
  }

  /** @type {{
   *    keypair: number[];
   *    username: string;
   *    pubkey?: string;
   *  }} */
  const requestBody = req.body;
  const { keypair, username, pubkey } = requestBody;
  if (!keypair) {
    res.status(400).send("Missing `keypair` request parameter");
    return;
  }
  if (!username) {
    res.status(400).send("Missing `username` request parameter");
    return;
  }

  const payerKeypair = Keypair.fromSecretKey(Uint8Array.from(keypair));
  const authorPubkey = pubkey ?? payerKeypair.publicKey;

  console.log({ username, authorPubkey });

  const fetch = await import("node-fetch").then(({ default: fetch }) => fetch);
  const userData = await fetch("https://api.github.com/users/" + username, {
    headers: {
      Authorization: `token ${process.env.GH_TOKEN}`,
      "User-Agent": "Github Oracle",
    },
  }).then((r) => {
    return r.json();
  });

  const isVerified = userData.bio?.includes("Solana Wallet: " + authorPubkey);
  if (!isVerified) {
    res
      .status(401)
      .send(
        'Make sure you added the following text "Solana Wallet: {YOUR_WALLET_PUBKEY}" into your GitHub bio.'
      );
    return;
  }

  const connection = await getConnection();
  const program = new Program(
    idl,
    REGISTRY_PROGRAM_ID,
    new Provider(
      connection,
      new Wallet(payerKeypair),
      Provider.defaultOptions()
    )
  );

  const [authorAddress, bump] = await PublicKey.findProgramAddress(
    [
      utils.bytes.utf8.encode("DROPME7"),
      utils.bytes.utf8.encode("authors"),
      utils.bytes.utf8.encode(username),
    ],
    REGISTRY_PROGRAM_ID
  );

  try {
    await program.rpc.register(
      { bump, name: username },
      {
        accounts: {
          author: authorAddress,
          oracle: ORACLE_KEYPAIR.publicKey,
          authority: payerKeypair.publicKey,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [ORACLE_KEYPAIR],
      }
    );
  } catch (e) {
    res
      .status(500)
      .send("Failed to call the Register RPC endpoint: " + e.message);
    return;
  }

  res.status(200).send("Verified");
};

/** @return {Promise<Connection>} */
async function getConnection() {
  const rpcUrl = clusterApiUrl("devnet");
  const connection = new Connection(rpcUrl, "confirmed");
  const version = await connection.getVersion();
  console.log("Connection to cluster established:", rpcUrl, version);

  return connection;
}
