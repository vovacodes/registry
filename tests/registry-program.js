import fs from "node:fs";
import assert from "node:assert";
import anchor from "@project-serum/anchor";
import { stringFromArrayString } from "../app/utils.js";

const ORACLE_KEYPAIR = anchor.web3.Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(
        new URL("../github-oracle/oracle_test_keypair.json", import.meta.url)
      )
    )
  )
);

const AUTHOR_NAME = "vovacodes";
const program = anchor.workspace.Registry;

describe("registry program", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  describe("registerAuthor", () => {
    it("fails if oracle pubkey is different from the hard-coded one", async () => {
      const [authorAccountAddress, bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            anchor.utils.bytes.utf8.encode("authors"),
            anchor.utils.bytes.utf8.encode(AUTHOR_NAME),
          ],
          program.programId
        );

      // Make sure there is no author account yet.
      await assert.rejects(
        () => program.account.authorAccountData.fetch(authorAccountAddress),
        /Account does not exist/
      );

      const fakeOracleKeypair = anchor.web3.Keypair.generate();

      await assert.rejects(() =>
        program.rpc.registerAuthor(
          {
            bump,
            name: AUTHOR_NAME,
          },
          {
            accounts: {
              author: authorAccountAddress,
              oracle: fakeOracleKeypair.publicKey,
              authority: provider.wallet.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
            },
            signers: [fakeOracleKeypair],
          }
        )
      );
    });

    it("registers author account", async () => {
      const [authorAccountAddress, bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            anchor.utils.bytes.utf8.encode("authors"),
            anchor.utils.bytes.utf8.encode(AUTHOR_NAME),
          ],
          program.programId
        );

      // Make sure there is no author account yet.
      await assert.rejects(
        () => program.account.authorAccountData.fetch(authorAccountAddress),
        /Account does not exist/
      );

      await program.rpc.registerAuthor(
        {
          bump,
          name: AUTHOR_NAME,
        },
        {
          accounts: {
            author: authorAccountAddress,
            oracle: ORACLE_KEYPAIR.publicKey,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          },
          signers: [ORACLE_KEYPAIR],
        }
      );

      const accountData = await program.account.authorAccountData.fetch(
        authorAccountAddress
      );

      // The name is correct
      assert.strictEqual(stringFromArrayString(accountData.name), AUTHOR_NAME);
      // The account's authority is the
      assert.strictEqual(
        accountData.authority.toString(),
        provider.wallet.publicKey.toString()
      );
    });
  });

  describe("unregisterAuthor", () => {
    it("should fail to unregister if `authority` doesn't match", async () => {
      const [authorAccountAddress] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            anchor.utils.bytes.utf8.encode("authors"),
            anchor.utils.bytes.utf8.encode(AUTHOR_NAME),
          ],
          program.programId
        );

      // Make sure the account exists (should be created by the previous tests).
      await program.account.authorAccountData.fetch(authorAccountAddress);

      await assert.rejects(
        () =>
          program.rpc.unregisterAuthor({
            accounts: {
              author: authorAccountAddress,
              // Invalid authority
              authority: anchor.web3.Keypair.generate().publicKey,
            },
          }),
        /Signature verification failed/
      );
    });

    it("should delete the author account", async () => {
      const [authorAccountAddress] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            anchor.utils.bytes.utf8.encode("authors"),
            anchor.utils.bytes.utf8.encode(AUTHOR_NAME),
          ],
          program.programId
        );

      // Make sure the account exists (should be created by the previous tests).
      await program.account.authorAccountData.fetch(authorAccountAddress);

      // Delete the account.
      await program.rpc.unregisterAuthor({
        accounts: {
          author: authorAccountAddress,
          authority: provider.wallet.publicKey,
        },
      });

      // Make sure there is no author account anymore.
      await assert.rejects(
        () => program.account.authorAccountData.fetch(authorAccountAddress),
        /Account does not exist/
      );
    });
  });
});
