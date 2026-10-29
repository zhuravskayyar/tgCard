# Cardastika — production relaunch gate (29.10.2026)

## Confirmed
- Repo: `zhuravskayyar/tgCard`
- New design branch: `codex/cardastika-improvements`
- Release candidate: `b3ec110bea16cb456e2f6746c11bb37e52b4c6b8`
- Vercel Preview: `dpl_DaAxUcRU27SkqHfatrPm3ADbR5zH` (READY)
- Current production: `20d04c7f48eb367e7cb992d5671d4e169ed91e7b`
- Vercel project: `cardastika`; custom domain: `app.cardastika.org`
- Postgres configured using `DATABASE_URL` in production.
- New branch has migrations `060` through `063`; `062` and `063` archive and replace card catalog, but do NOT cover a complete player relaunch archive.
- Source code has `grantStarterCards` and `recalculateAutomaticDeck`.
- Latest commit Vercel check: success. GitHub PR CI was not reported.

## Required release sequence
1. Connect Neon database; confirm actual production branch and database identifier, current migration version, count players and owned card instances. Do NOT display credentials.
2. Create an independent Neon restore point/branch or verified PostgreSQL full dump. Keep it until after player compensation.
3. Freeze writes during relaunch maintenance. Use the archive script only on the verified production database. Perform `audit` first, then run the `snapshot` command with a unique batch ID, and verify account/card totals.
4. Export the resulting archive to independently recoverable storage. Include `player_record`, Telegram/Google identities, all card instance data, definitions, levels, bonus power and deck positions. Never publish account data to GitHub.
5. On a cloned database, rehearse migrations 060–063 and catalogue seed; check count of 9 canonical new starter definitions.
6. Implement and rehearse one atomic reset that preserves account identity associations, clears progression/economy/inventory/history as requested, and grants the new set of 9 starter cards plus a valid automatic deck. Minimum database level is 1; gold and silver should be 0 for this relaunch, not 1,500.
7. Verify account linking works in Telegram and website, no dangling FK, 9 valid starter card instances per player, deck validation, login auth, migration history, and stable `/api/health`.
8. Deploy the exact reviewed commit as *staged production*, verify functionality and only then promote it to `app.cardastika.org`. Check that the Telegram Mini App button points to that URL.
9. After promotion, check Vercel production runtime errors and login flows; retain rollback candidate and database archive. Vercel rollback alone cannot undo destructive DB migrations.

## STOP conditions
- No independent restorable DB backup;
- Player/card archive count mismatch;
- New migration fails or references non-existent schema;
- Any unexpected impact on linked Google/Telegram identities;
- Starter deck check or API auth test fails;
- Preview success without production DB validation.