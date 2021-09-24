import fs from "node:fs";
import process from "node:process";
import anchor from "@project-serum/anchor";
import commander from "commander";
import fetch from "node-fetch";

const cli = new commander.Command();

cli.version("0.1.0");
cli
  .command("publish")
  .description("publish the package to registry")
  .action(publish);
cli.command("info").description("get the package info").action(info);
cli
  .command("register")
  .description("register an account")
  .requiredOption(
    "--pubkey <string>",
    "author's public key to associate with the account name"
  )
  .arguments("<username>", "GitHub username to use as the author account name")
  .action(register);

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

  const oracleResponse = await fetch(
    "https://us-central1-github-data-oracle.cloudfunctions.net/githubOracle",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username,
        keypair: Array.from(provider.wallet.payer.secretKey),
        pubkey,
      }),
    }
  );

  if (oracleResponse.status === 200) {
    console.log(await oracleResponse.text());
    console.log("✅ Registered the author account.");
    console.log(`🧑 Name:   ${username}`);
    console.log(`🔑 Pubkey: ${pubkey}`);
  } else {
    console.log(
      `❌ Failed to register the author account:\n${await oracleResponse.text()}`
    );
  }
}

function getRegistryProgram() {
  const idl = JSON.parse(
    fs.readFileSync(
      new URL("../target/idl/registry.json", import.meta.url),
      "utf8"
    )
  );
  const programId = new anchor.web3.PublicKey(idl.metadata.address);

  return new anchor.Program(idl, programId);
}

/**
 * @param arrayString {{ bytes: Array, len: import("@project-serum/anchor").BN }}
 * @return {string}
 */
function stringFromArrayString(arrayString) {
  const decoder = new TextDecoder();
  return decoder.decode(
    Uint8Array.from(arrayString.bytes.slice(0, arrayString.len.toNumber()))
  );
}
