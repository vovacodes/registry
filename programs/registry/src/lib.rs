use anchor_lang::prelude::*;
use std::str::FromStr;

cfg_if::cfg_if! {
    if #[cfg(feature = "local_test")] {
        const ORACLE_PUBKEY: &str = "H8JbkMcu35zRTShU3Sy3usNnUUJymR3wHZ6XvWFPv9TY";
    } else {
        const ORACLE_PUBKEY: &str = "FzPR9pz93ecai3shwEh9WrSSLsskgjsm1dxV2DtnL1Se";
    }
}

declare_id!("Hmo7aZ3yDGYiNsme2sFfhHqrbh6x8QuqXmWeVQtqYwGa");

#[program]
pub mod registry {
    use super::*;

    pub fn publish(ctx: Context<PublishAccounts>, publish_args: PublishArgs) -> ProgramResult {
        msg!(
            "new_package_account {:?}",
            ctx.accounts.new_package_account.key()
        );
        msg!("publish_args {:?}", publish_args);

        let package_account = &mut ctx.accounts.new_package_account;
        package_account.set_package_data(&ctx.accounts.authority.key, &publish_args)?;

        Ok(())
    }

    pub fn register_author(
        ctx: Context<RegisterAuthorAccounts>,
        register_args: RegisterAuthorArgs,
    ) -> ProgramResult {
        let author_account = &mut ctx.accounts.author;
        author_account.authority = ctx.accounts.authority.key();
        author_account.name = ArrayString::try_from_bytes(&register_args.name.as_bytes()).map_err(
            |err: String| {
                msg!(&err);
                RegistryError::InvalidString
            },
        )?;

        msg!("Registered author account {:?}", ctx.accounts.author.key());
        Ok(())
    }

    pub fn unregister_author(ctx: Context<UnregisterAuthorAccounts>) -> ProgramResult {
        // Account closing logic is declared with anchor annotations,
        // so we don't need to write any code here, the framework will take care of it.

        msg!(
            "Closing author account {:?} and transferring rent to the `authority` {:?}",
            ctx.accounts.author.key(),
            ctx.accounts.authority.key()
        );
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Eq, PartialEq, Clone)]
pub struct PublishArgs {
    pub bump: u8,
    pub scope: String,
    pub name: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Eq, PartialEq, Clone)]
pub struct RegisterAuthorArgs {
    pub bump: u8,
    pub name: String,
}

#[derive(Accounts)]
#[instruction(publish_args: PublishArgs)]
pub struct PublishAccounts<'info> {
    #[account(
        init,
        payer = authority,
        seeds = ["@vovacodes/react-sunbeam".as_bytes()],
        bump = publish_args.bump,
        space = 8 + std::mem::size_of::<PackageAccountData>()
    )]
    pub new_package_account: Account<'info, PackageAccountData>,

    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(register_args: RegisterAuthorArgs)]
pub struct RegisterAuthorAccounts<'info> {
    #[account(
        init,
        payer = authority,
        seeds = ["authors".as_bytes(), register_args.name.as_bytes()],
        bump = register_args.bump,
        space = 8 + std::mem::size_of::<AuthorAccountData>()
    )]
    pub author: Account<'info, AuthorAccountData>,

    /// The account to use as the `authority` of the author account.
    pub authority: AccountInfo<'info>,

    #[account(
        signer,
        address = Pubkey::from_str(ORACLE_PUBKEY).unwrap()
    )]
    pub oracle: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnregisterAuthorAccounts<'info> {
    #[account(mut, close = authority, has_one = authority)]
    pub author: Account<'info, AuthorAccountData>,

    /// The author account's `authority`.
    #[account(signer)]
    pub authority: AccountInfo<'info>,
}

#[account]
pub struct AuthorAccountData {
    /// Author's GitHub username.
    pub name: ArrayString,
    /// Author's public key.
    /// TODO: Allow many public keys for the same username.
    pub authority: Pubkey,
}

#[account]
pub struct PackageAccountData {
    /// Package scope, without leading `@`.
    pub scope: ArrayString,
    /// Package name.
    pub name: ArrayString,
    /// Public key of the package authority.
    pub authority: Pubkey,
}

impl PackageAccountData {
    pub fn set_package_data(
        &mut self,
        authority: &Pubkey,
        publish_args: &PublishArgs,
    ) -> std::result::Result<(), RegistryError> {
        let error_mapper = |err: String| {
            msg!(&err);
            RegistryError::InvalidString
        };

        self.authority = authority.clone();
        self.scope =
            ArrayString::try_from_bytes(publish_args.scope.as_bytes()).map_err(error_mapper)?;
        self.name =
            ArrayString::try_from_bytes(publish_args.name.as_bytes()).map_err(error_mapper)?;

        Ok(())
    }
}

#[error]
pub enum RegistryError {
    #[msg("Can not create ArrayString<32> from provided String.")]
    InvalidString,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Eq, PartialEq, Clone)]
pub struct ArrayString {
    // Array of bytes representing the utf8 string. Encoding validation is done upon creation,
    // so can be safely converted to a string slice without additional checks.
    pub bytes: [u8; 32],
    // Length of the string.
    pub len: u64,
}

impl ArrayString {
    const N: usize = 32;

    pub fn try_from_bytes(src: &[u8]) -> std::result::Result<Self, String> {
        Self::validate_source(src)?;

        let len = src.len() as u64;
        let mut bytes: [u8; Self::N] = [0; Self::N];
        &mut bytes[..src.len()].copy_from_slice(src);

        Ok(Self { len, bytes })
    }

    pub fn try_update_from_bytes(&mut self, src: &[u8]) -> std::result::Result<(), String> {
        Self::validate_source(src)?;

        let len = src.len();
        self.bytes[..len].copy_from_slice(src);
        self.len = len as u64;

        Ok(())
    }

    fn validate_source(src: &[u8]) -> std::result::Result<(), String> {
        let len = src.len();
        if len > Self::N {
            return Err(format!(
                "`src` slice is too long, maximum allowed is {} bytes, received {} bytes.",
                Self::N,
                len,
            ));
        }
        // Make sure `src` is a valid utf-8 string.
        std::str::from_utf8(src).map_err(|err| err.to_string())?;

        Ok(())
    }
}

impl AsRef<str> for ArrayString {
    fn as_ref(&self) -> &str {
        // SAFETY: we check for the string validity during the creation.
        unsafe { &std::str::from_utf8_unchecked(&self.bytes[..self.len as usize]) }
    }
}

// FIXME: Use this version when const generics are fixed in the upstream: https://github.com/project-serum/anchor/issues/632
// #[derive(AnchorSerialize, AnchorDeserialize, Debug, Eq, PartialEq, Clone)]
// pub struct ArrayString<const N: usize> {
//     // Array of bytes representing the utf8 string. Encoding validation is done upon creation,
//     // so can be safely converted to a string slice without additional checks.
//     pub bytes: [u8; N],
//     // Length of the string.
//     pub len: usize,
// }
//
// impl<const N: usize> ArrayString<N> {
//     pub fn try_from_bytes(src: &[u8]) -> Result<Self, String> {
//         Self::validate_source(src)?;
//
//         let len = src.len();
//         let mut bytes: [u8; N] = [0; N];
//         &mut bytes[..src.len()].copy_from_slice(src);
//
//         Ok(Self { len, bytes })
//     }
//
//     pub fn try_update_from_bytes(&mut self, src: &[u8]) -> Result<(), String> {
//         Self::validate_source(src)?;
//
//         let len = src.len();
//         self.bytes[..len].copy_from_slice(src);
//         self.len = len;
//
//         Ok(())
//     }
//
//     fn validate_source(src: &[u8]) -> Result<(), String> {
//         let len = src.len();
//         if len > N {
//             return Err(format!(
//                 "`src` slice is too long, maximum allowed is {} bytes, received {} bytes.",
//                 N, len,
//             ));
//         }
//         // Make sure `src` is a valid utf-8 string.
//         std::str::from_utf8(src).map_err(|err| err.to_string())?;
//
//         Ok(())
//     }
// }
//
// impl<const N: usize> AsRef<str> for ArrayString<N> {
//     fn as_ref(&self) -> &str {
//         // SAFETY: we check for the string validity during the creation.
//         unsafe { &std::str::from_utf8_unchecked(&self.bytes[..self.len]) }
//     }
// }

#[cfg(test)]
mod tests {
    use super::*;

    // mod array_string {
    //     use super::*;
    //
    //     #[test]
    //     fn create_from_shorter_slice() {
    //         let s = ArrayString::<10>::try_from_bytes(b"hello").unwrap();
    //         assert_eq!(s.as_ref(), "hello")
    //     }
    //
    //     #[test]
    //     fn create_from_exact_len_slice() {
    //         let s = ArrayString::<5>::try_from_bytes(b"hello").unwrap();
    //         assert_eq!(s.as_ref(), "hello")
    //     }
    //
    //     #[test]
    //     fn create_from_longer_slice() {
    //         let result = ArrayString::<5>::try_from_bytes(b"hello1");
    //         assert_eq!(
    //             result,
    //             Err(
    //                 "`src` slice is too long, maximum allowed is 5 bytes, received 6 bytes.".to_owned()
    //             )
    //         )
    //     }
    // }
}
