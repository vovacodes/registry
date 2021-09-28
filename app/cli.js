import fs from "node:fs";
import process from "node:process";
import anchor, { utils } from "@project-serum/anchor";
import commander from "commander";
import fetch from "node-fetch";
import { stringFromArrayString } from "./utils.js";

const ORACLE_URL = process.env.LOCAL_TEST
  ? "http://localhost:8080"
  : "https://us-central1-github-data-oracle.cloudfunctions.net/githubOracle";

const version = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url)).toString()
).version;

const cli = new commander.Command();

cli.version(version);
cli
  .command("publish")
  .description("📦 publish the package to registry")
  .action(publish);

cli.command("info").description("🧾 get the package info").action(info);

cli
  .command("register")
  .description("📝 register an author account")
  .requiredOption(
    "--pubkey <string>",
    "author's public key to associate with the account name"
  )
  .arguments("<username>", "GitHub username to use as the author account name")
  .action(register);

cli
  .command("unregister")
  .description(
    "🗑 delete the author account and transfer rent lamports back to the payer"
  )
  .arguments("<username>", "Author account name")
  .action(unregister);

cli.showHelpAfterError();
cli.showSuggestionAfterError();
cli.parse(process.argv);

async function publish() {
  const provider = anchor.Provider.local();
  const program = getRegistryProgram();

  const [newPackageAccountAddress, bump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("@vovacodes/react-sunbeam")],
      programId
    );

  // Execute the RPC.
  await program.rpc.publish(
    {
      bump,
      scope: "vovacodes",
      name: "react-sunbeam",
    },
    {
      accounts: {
        newPackageAccount: newPackageAccountAddress,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    }
  );

  const packageAccountData = await program.account.packageAccountData.fetch(
    newPackageAccountAddress
  );

  console.log(
    `Published @${stringFromArrayString(
      packageAccountData.scope
    )}/${stringFromArrayString(packageAccountData.name)} by ${
      packageAccountData.authority
    }`
  );
}

async function info() {
  const program = getRegistryProgram();

  const [packageAccountAddress] =
    await anchor.web3.PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("@vovacodes/react-sunbeam")],
      program.programId
    );

  const packageAccountData = await program.account.packageAccountData.fetch(
    packageAccountAddress
  );

  console.log("Scope:", `@${stringFromArrayString(packageAccountData.scope)}`);
  console.log("Name:", stringFromArrayString(packageAccountData.name));
  console.log("Authority:", packageAccountData.authority.toString());
}

/**
 * @param username {string}
 * @param options {{ pubkey: string }}
 */
async function register(username, options) {
  const { pubkey } = options;

  const provider = anchor.Provider.local();

  const oracleResponse = await fetch(ORACLE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username,
      keypair: Array.from(provider.wallet.payer.secretKey),
      pubkey,
    }),
  });
  const responseText = await oracleResponse.text();

  if (oracleResponse.status === 200) {
    const authorAccountAddress = responseText;
    console.log(
      `✅ Successfully registered the author account: ${authorAccountAddress}`
    );
    console.log(`🧑 Name:   ${username}`);
    console.log(`🔑 Pubkey: ${pubkey}`);
  } else {
    console.log(`❌ Failed to register the author account:\n${responseText}`);
  }
}

/** @param username {string} */
async function unregister(username) {
  const provider = getLocalProvider();
  const program = getRegistryProgram(provider);

  const [authorAddress] = await anchor.web3.PublicKey.findProgramAddress(
    [utils.bytes.utf8.encode("authors"), utils.bytes.utf8.encode(username)],
    program.programId
  );

  // Execute the RPC.
  await program.rpc.unregisterAuthor({
    accounts: {
      author: authorAddress,
      authority: provider.wallet.publicKey,
    },
  });

  console.log(`✅ Successfully deleted the author account: ${authorAddress}`);
}

function getLocalProvider() {
  return anchor.Provider.local(anchor.web3.clusterApiUrl("devnet"));
}

/** @param provider {import("@project-serum/anchor").Provider} */
function getRegistryProgram(provider) {
  const idl = JSON.parse(
    fs.readFileSync(
      new URL("../target/idl/registry.json", import.meta.url),
      "utf8"
    )
  );
  const programId = new anchor.web3.PublicKey(idl.metadata.address);

  return new anchor.Program(idl, programId, provider);
}
