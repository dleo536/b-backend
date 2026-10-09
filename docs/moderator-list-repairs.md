# Moderator list management

Only the authenticated Firebase account with verified email `dannyapolistest@gmail.com` receives the effective `mod` role and `isModerator`, `canManageLists`, and `canRepairLists` capabilities. It must have an active app profile. The backend checks Firebase's token email and verification status on every request; editable profile email, submitted roles, and unrelated stored `mod` or `admin` roles do not grant this permission. Existing admin tools retain their own permissions. No production account row is changed to grant access.

Deploy the backend and mobile changes through the normal release process. The backend's existing automatic TypeORM migration runner creates `list_album_repairs` using `1791504000000-AddAlbumRepairAudit.ts`. This additive migration creates only an audit table/index; it does not change any lists, metadata IDs, reviews, or account roles. The automatic runner also creates `list_moderator_actions` using `1791507600000-AddModeratorListActions.ts` to retain album arrays before/after moderator additions, removals, and reorders. No extra environment variable or mapper command is needed for this feature. Installing from Xcode does not confer permissions: deploy the updated backend to the API your phone uses, then rebuild/reload the mobile app and refresh the profile. The designated email is `dannyapolistest@gmail.com` (the earlier address with an extra `t` is not authorized).

## In the app

1. Sign in as `dannyapolistest@gmail.com` and refresh your profile. If the email is unverified, use **Verify email for moderator access** in the profile action menu, follow the emailed link, then refresh again.
2. Open **Me → profile action menu → Moderator**.
3. Search by list title or owner username. Public, private, backlog, and favorites lists are available in this protected browser.
4. Open the desired list, then **list menu → Edit List** to remove or reorder albums. Save commits the selected list only. If someone changed the album array while the editor was open, close it, refresh the list, and retry. To add an album, open its album page, choose **Add to list**, and search everyone’s lists by list title or owner username. Owner names and visibility are shown, with **Load more lists** for additional results. This includes private and system lists. New lists you create still belong to your account.

For the existing MusicBrainz repair workflow, open **list menu → Repair list albums** and continue:
5. Select the legacy entry by its current list position/title/ID. Search Spotify and select the correct artist, album, and edition. Enter a reason.
6. Choose **Preview replacement**. This uses a database read-only transaction and changes nothing. Check the old entry and replacement carefully, particularly when the original title was never stored.
7. Choose **Apply replacement**. Only that selected list's slot changes to the Spotify album ID; ordering, list ownership/title/description/visibility, and all other lists/reviews/catalog mappings are preserved. The original IDs are archived with the actor, reason, preview, and before/after arrays in the same transaction.
8. **Repair history → Restore original album** undoes a repair using the archived IDs. Undo is rejected if the list's album array has changed since that repair; undo later repairs first rather than overwriting newer edits. Audit history remains retained after undo.

This is an individual list edit, not a global MusicBrainz-to-Spotify mapping. The old UUID is not assumed to be a MusicBrainz release-group ID. The MusicBrainz VM can be offline. Existing MusicBrainz code and catalog IDs are unchanged. For a later provider rollback, restore relevant individual list edits from repair history; global mappings continue to use the separate reviewed mapper.

The moderator does not receive general list deletion, profile editing, review editing, or admin privileges. Ordinary list routes remain restricted to the owner; the moderator uses separate protected routes to add, remove, and reorder albums. Removals change list membership only; catalog data, reviews, and MusicBrainz IDs are retained. The new moderator audit table retains original list entries. Other accounts cannot access the moderator browser or repair endpoints, including private list reads. Public user responses do not expose the role/capability or moderator email.

## Backend routes

All routes require Firebase authentication and the single-account moderator guard; Spotify rate limits also apply.

- `GET /moderator/lists?query=<title-or-username>&offset=0`
- `GET /moderator/lists/:listId`
- `POST /moderator/lists/:listId/albums` with `albumId` (atomic append; duplicate IDs are a no-op)
- `PATCH /moderator/lists/:listId/albums` with `albumIds` and `expectedAlbumIds` (remove/reorder only; rejects stale arrays)
- `POST /moderator/lists/:listId/album-repairs/preview` with `albumId`, `spotifyAlbumId`, and `reason`
- `POST /moderator/lists/:listId/album-repairs/apply` with the same fields and the returned `previewFingerprint`
- `GET /moderator/lists/:listId/album-repairs`
- `POST /moderator/lists/:listId/album-repairs/:auditId/undo`

Apply rechecks the Spotify album and list revision, then locks the list before writing. Stale previews and duplicate target albums are rejected. The repair and audit either both commit or both roll back. No email address from the client is used for authorization. The app clears its metadata cache after apply/undo and reloads the affected list.

## Validation

Run backend build/unit tests, mobile metadata/moderator tests, typecheck, and iOS export. The opt-in PostgreSQL integration tests run the actual migration and service transactions in a disposable local database, verify preview makes zero changes, verify another list is untouched, verify original-ID restoration, and force a database constraint failure to verify the list and audit roll back together:

```bash
RUN_LIST_REPAIR_PG_TEST=1 DB_HOST=127.0.0.1 DB_PORT=55439 DB_NAME=bsides_list_repair_test npm test -- --runInBand --watchman=false list-album-repair.integration
```

The integration test refuses any other host, port, or database name and isolates its tables in a temporary schema. Do not run it against an app database.
