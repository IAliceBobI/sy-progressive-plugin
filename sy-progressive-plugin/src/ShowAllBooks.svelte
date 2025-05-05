<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Dialog, confirm } from "siyuan";
    import { chunks, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { prog } from "./Progressive";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    type TaskType = {
        bookID: string;
        bookInfo: BookInfo;
        row: Block;
        bookIndex: string[][];
    };

    const MAXBOOKNAME = 10;

    export let dialog: Dialog;

    let books: TaskType[];

    onMount(async () => {
        await loadBooks();
    });

    async function loadBooks() {
        const tasks = Object.entries(prog.storage.booksInfos())
            .map(([bookID]) => {
                const bookInfo = prog.storage.booksInfo(bookID);
                const idx = prog.storage.loadBookIndexIfNeeded(bookID);
                const row = siyuan.sqlOne(
                    `select content from blocks where type='d' and id="${bookID}"`,
                );
                return [bookID, bookInfo, idx, row];
            })
            .flat();
        books = chunks(await Promise.all(tasks), 4).map(([a, b, c, d]) => {
            const ret = {} as TaskType;
            ret.bookID = a as any;
            ret.bookInfo = b as any;
            ret.bookIndex = c as any;
            ret.row = d as any;
            if (!ret.row.content)
                ret.row.content = `(${tomatoI18n.找不到此书籍})`;
            return ret;
        });
    }

    onDestroy(async () => {});

    async function btnStartToLearn(bookID: string) {
        await prog.startToLearnWithLock(bookID);
        dialog.destroy();
    }
    async function btnAddProgressiveReadingWithLock(bookID: string) {
        prog.addProgressiveReadingWithLock(bookID);
        dialog.destroy();
    }

    async function btnConfirm(bookID: string, name: string) {
        confirm(
            "⚠️",
            tomatoI18n.只删除记录与辅助数据不删除分片不删除闪卡等删除 + name,
            async () => {
                await prog.storage.removeIndex(bookID);
                const idx = books.findIndex((book) => {
                    if (book.bookID == bookID) return true;
                });
                if (idx != -1) {
                    books.splice(idx, 1);
                    books = books;
                }
            },
        );
    }
</script>

<!-- https://learn.svelte.dev/tutorial/if-blocks -->
{#if books}
    <table>
        <thead>
            <tr>
                <th>NO.</th>
                <th>{tomatoI18n.书名}</th>
                <th>{tomatoI18n.进度}</th>
                <th>{tomatoI18n.忽略}</th>
                <th>{tomatoI18n.制卡}</th>
                <th>{tomatoI18n.标号}</th>
                <th>{tomatoI18n.末尾}</th>
                <th>{tomatoI18n.断句}p</th>
                <th>{tomatoI18n.断句}t</th>
                <th>{tomatoI18n.断句}i</th>
                <th>{tomatoI18n.阅读}</th>
                <th>{tomatoI18n.重新分片}</th>
                <th>{tomatoI18n.删除}</th>
            </tr>
        </thead>
        <tbody>
            {#each books.slice().reverse() as book, i}
                <tr>
                    <td class="prog-style__id">
                        {i + 1}
                    </td>

                    <td class="prog-style__id" title={book.row.content}>
                        {book.row.content.slice(
                            0,
                            MAXBOOKNAME,
                        )}{#if book.row.content.length > MAXBOOKNAME}...{/if}
                    </td>

                    <td class="prog-style__id">
                        {Math.ceil(
                            (book.bookInfo.point /
                                (book.bookIndex.length + 1)) *
                                100,
                        )}%
                    </td>

                    <td
                        class="prog-style__id"
                        title={prog.plugin.i18n.ignoreTxt +
                            !!book.bookInfo.ignored}
                    >
                        <input
                            type="checkbox"
                            bind:checked={book.bookInfo.ignored}
                            on:click={() =>
                                prog.storage.setIgnoreBook(
                                    book.bookID,
                                    !book.bookInfo.ignored,
                                )}
                        />
                    </td>

                    <td
                        class="prog-style__id"
                        title={prog.plugin.i18n.autoCard +
                            !!book.bookInfo.autoCard}
                    >
                        <input
                            type="checkbox"
                            bind:checked={book.bookInfo.autoCard}
                            on:click={() =>
                                prog.storage.toggleAutoCard(book.bookID)}
                        />
                    </td>

                    <td
                        class="prog-style__id"
                        title={tomatoI18n.给分片内段落标上序号 +
                            book.bookInfo.addIndex2paragraph}
                    >
                        <input
                            type="checkbox"
                            bind:checked={book.bookInfo.addIndex2paragraph}
                            on:click={() =>
                                prog.storage.setAddingIndex2paragraph(
                                    book.bookID,
                                    !book.bookInfo.addIndex2paragraph,
                                )}
                        />
                    </td>

                    <td
                        class="prog-style__id"
                        title={tomatoI18n.显示上一分片最后一个内容块 +
                            !!book.bookInfo.showLastBlock}
                    >
                        <input
                            type="checkbox"
                            bind:checked={book.bookInfo.showLastBlock}
                            on:click={() =>
                                prog.storage.setShowLastBlock(
                                    book.bookID,
                                    !book.bookInfo.showLastBlock,
                                )}
                        />
                    </td>

                    <td
                        class="prog-style__id"
                        title={tomatoI18n.断句为段落块 +
                            !!book.bookInfo.autoSplitSentenceP}
                    >
                        <input
                            type="checkbox"
                            bind:checked={book.bookInfo.autoSplitSentenceP}
                            on:click={() =>
                                prog.storage.setAutoSplitSentence(
                                    book.bookID,
                                    !book.bookInfo.autoSplitSentenceP,
                                    "p",
                                )}
                        />
                    </td>

                    <td
                        class="prog-style__id"
                        title={tomatoI18n.断句为任务块 +
                            !!book.bookInfo.autoSplitSentenceT}
                    >
                        <input
                            type="checkbox"
                            bind:checked={book.bookInfo.autoSplitSentenceT}
                            on:click={() =>
                                prog.storage.setAutoSplitSentence(
                                    book.bookID,
                                    !book.bookInfo.autoSplitSentenceT,
                                    "t",
                                )}
                        />
                    </td>

                    <td
                        class="prog-style__id"
                        title={tomatoI18n.断句为无序表 +
                            !!book.bookInfo.autoSplitSentenceI}
                    >
                        <input
                            type="checkbox"
                            bind:checked={book.bookInfo.autoSplitSentenceI}
                            on:click={() =>
                                prog.storage.setAutoSplitSentence(
                                    book.bookID,
                                    !book.bookInfo.autoSplitSentenceI,
                                    "i",
                                )}
                        />
                    </td>

                    <td>
                        <button
                            title="《{book.row.content}》"
                            class="prog-style__button"
                            on:click={() => btnStartToLearn(book.bookID)}
                            >📖</button
                        >
                    </td>
                    <td>
                        <button
                            title="{tomatoI18n.重新分片}《{book.row.content}》"
                            class="prog-style__button"
                            on:click={() =>
                                btnAddProgressiveReadingWithLock(book.bookID)}
                            >🍕</button
                        >
                    </td>
                    <td>
                        <button
                            title="{tomatoI18n.删除}《{book.row
                                .content}》（{tomatoI18n.不删除已经产生的分片等文件}）"
                            class="prog-style__button"
                            on:click={() =>
                                btnConfirm(book.bookID, book.row.content)}
                            >🗑️</button
                        >
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
{:else}
    <h1>loading……</h1>
{/if}

<style>
</style>
