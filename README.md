[中文](https://github.com/IAliceBobI/sy-progressive-plugin/blob/main/README_zh_CN.md)

# Progressive Learning

I have always struggled to finish reading long documents and imported e-books.

By chance, I learned about the basic methods and some basics of progressive learning, and wanted to give it a try, so I developed this plugin.

The functionality of this plugin is to divide a document into small segments and read them one by one. During the reading process, you can take notes and create flashcards for future review.

The current state of the plugin is quite basic, and I haven't used it much myself, so there are still quite a few bugs that I haven't discovered.

Also, the functionality of the plugin may differ greatly from what you have in mind...

As for whether using it can improve learning efficiency, let me use it for a few months first... add some features... and fix some bugs...

Below is a brief explanation of how to use it.

## Add Document

**Open the plugin menu, click on "Add Current Document," then click "Start Learning."**

After adding a document, the plugin will perform segmentation.

If the document is large, like the one in the picture, with millions of words, the segmentation process may take a while, so please be patient.

The segmentation process of the plugin does not modify the original text or create new documents. It only reads, counts, and builds an index.

![Alt text](assets/addDoc.png)

## Start Learning

![Alt text](assets/reading.png)

* `Equal sign (=)`: Below the equal sign is the note area, which can be preserved. Above the equal sign is the original text with remarks added by the plugin, please do not modify.
* `Current Segment 0`: Segments are numbered starting from 0, and 0 represents the beginning of a book.
* `Delete, Continue`: The notes for the current segment will not be preserved.
* `Create Flashcard, Continue`: The notes for the current segment will be preserved, and the current document will be turned into a flashcard. Finally, the original text will be deleted and a link to the original text will be added.

## Future Plans

Let me use it first, then make improvements...

# Bug Reports, Suggestions

QQ Group: 263961482

[Or submit issues on GitHub](https://github.com/IAliceBobI/sy-progressive-plugin/issues)

[Or submit issues on the official forum](https://ld246.com/tag/siyuan)

# Changelog

## 2023-11-17

* First version
