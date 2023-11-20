[中文](https://github.com/IAliceBobI/sy-progressive-plugin/blob/main/README_zh_CN.md)

# Progressive Learning

The purpose of this plugin is to divide long documents into small segments called "fragments" and read them one by one. During the reading process, you can take notes and create flashcards for future review.

Let's talk about how to use it.

## Adding Documents

**Select a long document for progressive learning. Open the plugin menu and click on "Add Current Document"**

![Alt text](assets/addDoc.png)

There are two ways to split the document, and you can use them together or separately, as shown in the image:

![Alt text](assets/split.png)

After adding the document, the plugin will perform the "fragmentation" operation.

If the document is large, like the one shown in the image, with millions of words, the plugin may take some time to perform the fragmentation. Please be patient.

The "fragmentation" operation does not modify the original document or create new ones. It only reads, analyzes, and saves the fragments.

> **Note:** After the fragmentation, do not modify the original document, such as deleting some blocks, as it will cause the plugin to not be able to find those blocks during learning.

## Starting the Learning Process

**Open the plugin menu and click on "Start Learning"**

> The shortcut for "Start Learning" is `Alt+-`, right after the "Flashcards" shortcut `Alt+0`. One for learning and one for reviewing.

![Alt text](assets/reading.png)

**Within each "fragment," each segment of text starts with an asterisk (*) that links back to the original document.**

**You can freely modify the content within the "fragment," add paragraphs, create flashcards, etc. If you choose to keep this fragment, any modified content within the fragment will be preserved, while the unchanged content will be deleted to maintain simplicity.**

> **Note:** The update of the index may be slightly delayed after modifying the content, as the plugin relies on the index. If you modify the text and immediately click on "Keep and Continue" or "Create Flashcards and Continue," the modified content may not be preserved.

![Alt text](assets/buttons.png)

* `[Fragment Number]`: Fragments are numbered starting from 0. `[0]` represents the beginning of the book. The second fragment is `[1]`. In the image, it is `[39]`.
* `Previous Fragment`: Keep the notes of the current segment and go back to the previous fragment's content.
* `Delete and Continue`: Do not keep the notes of the current segment and continue to the next fragment.
* `Create Flashcards and Continue`: Keep the notes of the current segment and turn the current document into a flashcard. The original text will be deleted, and a link to the original text will be added. Continue to the next fragment.
* `Keep and Continue`: Keep the notes of the current segment, delete the original text, and add a link to the original text. Continue to the next fragment.
* `Delete and Exit`: Do not keep the notes of the current segment. Exit the learning process.
* `Delete and Change Book`: Do not keep the notes of the current segment. Read another document added to the "Progressive Learning" plugin.

> **Note:** The document title of each fragment can be modified. However, do not modify the document remarks, as the plugin will not be able to find this document in the future.

## Read the Segment at the Cursor Position

If you want to start reading from a specific part of the original document, you can use the "Read Segment at Cursor Position" feature.

Open an original document that has already been added to the progressive learning, browse to a specific location, right-click, and go to `Plugin`->`Read Segment at Cursor Position` to jump to that "fragment."

![Alt text](assets/rightClickMenu.png)

# Plans

- [ ] Continuously improve the plugin in various ways.
- [ ] Improve i18n (internationalization).
- [ ] Merge a large number of saved fragments into a single document?

# Bug Reports and Suggestions

The plugin needs improvement through long-term use. If you have any issues or suggestions, we can discuss them together.

QQ Group: 263961482

[Or submit issues on GitHub](https://github.com/IAliceBobI/sy-progressive-plugin/issues)

[Or submit issues on the official forum](https://ld246.com/tag/siyuan)

# Changelog

## 2023-11-20

* Modified content, including flashcards and appearance, will be saved.
* Optimized note preservation method.
* Removed unnecessary introduction in the readme and directlyjumped into the content.

## 2023-11-19

* Improved existing features.
* Fixed some bugs.

## 2023-11-17

* Initial version.