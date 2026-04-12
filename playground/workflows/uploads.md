# Working with Uploaded Files

Files uploaded by the user are stored in `./uploads/` (relative to this playground directory). Each file gets its own subdirectory: `uploads/{fileId}/`.

[see: ./overview.md]

## Discovery

To see what files are available, list the uploads directory:

```sh
list_directory uploads/
```

This shows one subdirectory per uploaded file. Each subdirectory contains the processed content.

## File types

### Text files and CSVs

Available as a single plain text file inside `uploads/{fileId}/`:

```text
uploads/{fileId}/
  document.txt
```

**Reading**: Use `read_text_file` on the file. For large files, use the `head` or `tail` parameters to read only the portion you need.

**Editing**: Use `edit_file` with `oldText`/`newText` patches.

### Images

Images remain in blob storage (not editable as text). Each image has a companion description file:

```text
uploads/{fileId}/
  photo.description.md      ← visual description + metadata
```

The description file contains YAML frontmatter with the blob pathname needed for targeted analysis:

```markdown
---
blob_pathname: uploads/{fileId}/photo-abc123.jpg
mediaType: image/jpeg
---
This image shows...
```

**Finding an image by content**: Read the `.description.md` file — the auto-generated description lets you determine relevance without re-analyzing the image.

**Asking a specific question about an image**: Read the `.description.md` to get the `blob_pathname`, then use the image analysis tool with your specific question and that pathname.

### PDFs

Extracted text is stored as a single `.txt` file, the same as text files:

```text
uploads/{fileId}/
  document.txt
```

## Providing files for download

If the user wants to download an edited file, use the download publication tool with the file path (e.g. `uploads/{fileId}/data.txt`). The tool returns a URL the user can click to download.

## Cross-session availability

Uploaded files persist across all chats. The `uploads/` directory is not scoped to a single conversation — files from previous sessions are accessible here and can be referenced in new chats.

[see: ./overview.md]
