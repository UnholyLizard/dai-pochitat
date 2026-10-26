-- Migration 0005: the catalog import used the annotation cell as the publisher when a thematic sheet
-- had no publisher column, so ~28 books carry their description in `publisher`.
-- Real publisher names are short (the longest is 55 characters); anything over 100 is a description.

-- Keep the text: move it to annotation_ru where there is none yet (and keep the search index in step).
UPDATE books_fts
   SET annotation_ru = (SELECT b.publisher FROM books b WHERE b.rowid = books_fts.rowid)
 WHERE rowid IN (SELECT rowid FROM books WHERE length(publisher) > 100 AND COALESCE(annotation_ru, '') = '');

UPDATE books
   SET annotation_ru = publisher
 WHERE length(publisher) > 100 AND COALESCE(annotation_ru, '') = '';

UPDATE books SET publisher = NULL WHERE length(publisher) > 100;
