<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { confirm } from "siyuan";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { prog } from "./Progressive";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
    import { createAllPieces } from "./helper";
    import DialogSvelte from "../../sy-tomato-plugin/src/libs/DialogSvelte.svelte";
    import { validateNum, objOverrideNull } from "stonev5-utils";
    import TomatoVip from "../../sy-tomato-plugin/src/TomatoVIP.svelte";
    import { NotVIPMaxPlannedBooks } from "./constants";

    type TaskType = {
        bookID: string;
        bookInfo: BookInfo;
        bookIndex: string[][];
        row: Block;
    };

    const MAXBOOKNAME = 10;

    interface Props {
        dm: DestroyManager;
    }

    let { dm }: Props = $props();

    export function destroy() {
        dm.destroyBy();
    }

    let books: TaskType[] = $state([]);

    onMount(async () => {
        const tasks = Object.entries(progStorage.booksInfos()).map(
            ([bookID]) => {
                const bookInfo = progStorage.booksInfo(bookID);
                const idx = progStorage.loadBookIndexIfNeeded(bookID);
                const row = siyuan.sqlOne(
                    `select content from blocks where type='d' and id="${bookID}"`,
                );
                return { bookID, bookInfo, idx, row };
            },
        );
        books.splice(0, books.length);
        for (const task of tasks) {
            const ret = {} as TaskType;
            ret.bookID = task.bookID;
            ret.bookInfo = objOverrideNull(
                await task.bookInfo,
                ProgressiveStorage.defaultBookInfo(),
            );
            ret.bookIndex = await task.idx;
            ret.row = await task.row;
            if (!ret.row.content)
                ret.row.content = "🚫" + ret.bookInfo.bookName;
            books.push(ret);
        }
        books = books;
    });

    onDestroy(destroy);

    async function btnStartToLearn(bookID: string) {
        await prog.startToLearnWithLock(bookID);
        destroy();
    }
    async function btnAddProgressiveReadingWithLock(bookID: string) {
        prog.addProgressiveReadingWithLock(bookID);
        destroy();
    }

    async function btnConfirm(bookID: string, name: string) {
        confirm(
            "⚠️",
            tomatoI18n.只删除记录与辅助数据不删除分片不删除闪卡等删除 + name,
            async () => {
                await progStorage.removeIndex(bookID);
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
            <th>{tomatoI18n.删除}</th>
            <th>{tomatoI18n.所有}</th>
            <th>{tomatoI18n.天数}</th>
            <th>{tomatoI18n.重新分片}</th>
        </tr>
    </thead>
    <tbody>
        {#each books.slice().reverse() as book, i}
            <tr
                title={book.bookInfo.finishIgnore
                    ? tomatoI18n.非VIP最多只能激活x个规划学习天数的书籍(
                          NotVIPMaxPlannedBooks,
                      )
                    : undefined}
                class:finishedIgnore={book.bookInfo.finishIgnore}
            >
                <td>
                    {#if book.bookInfo.finishIgnore}
                        <TomatoVip codeValid={false}></TomatoVip>
                    {:else}
                        {i + 1}
                    {/if}
                </td>

                <td title={book.row.content}>
                    {book.row.content.slice(
                        0,
                        MAXBOOKNAME,
                    )}{#if book.row.content.length > MAXBOOKNAME}...{/if}
                </td>

                <td>
                    {Math.ceil(
                        (book.bookInfo.point / (book.bookIndex.length + 1)) *
                            100,
                    )}%
                </td>

                <td
                    title={tomatoI18n.忽略 + !!book.bookInfo.ignored}
                >
                    <input
                        type="checkbox"
                        bind:checked={book.bookInfo.ignored}
                        onclick={() =>
                            progStorage.setIgnoreBook(
                                book.bookID,
                                !book.bookInfo.ignored,
                            )}
                    />
                </td>

                <td
                    title={tomatoI18n.自动制卡 + !!book.bookInfo.autoCard}
                >
                    <input
                        type="checkbox"
                        bind:checked={book.bookInfo.autoCard}
                        onclick={() => progStorage.toggleAutoCard(book.bookID)}
                    />
                </td>

                <td
                    title={tomatoI18n.给分片内段落标上序号 +
                        book.bookInfo.addIndex2paragraph}
                >
                    <input
                        type="checkbox"
                        bind:checked={book.bookInfo.addIndex2paragraph}
                        onclick={() =>
                            progStorage.setAddingIndex2paragraph(
                                book.bookID,
                                !book.bookInfo.addIndex2paragraph,
                            )}
                    />
                </td>

                <td
                    title={tomatoI18n.显示上一分片最后一个内容块 +
                        !!book.bookInfo.showLastBlock}
                >
                    <input
                        type="checkbox"
                        bind:checked={book.bookInfo.showLastBlock}
                        onclick={() =>
                            progStorage.setShowLastBlock(
                                book.bookID,
                                !book.bookInfo.showLastBlock,
                            )}
                    />
                </td>

                <td
                    title={tomatoI18n.断句为段落块 +
                        !!book.bookInfo.autoSplitSentenceP}
                >
                    <input
                        type="checkbox"
                        bind:checked={book.bookInfo.autoSplitSentenceP}
                        onclick={() =>
                            progStorage.setAutoSplitSentence(
                                book.bookID,
                                !book.bookInfo.autoSplitSentenceP,
                                "p",
                            )}
                    />
                </td>

                <td
                    title={tomatoI18n.断句为任务块 +
                        !!book.bookInfo.autoSplitSentenceT}
                >
                    <input
                        type="checkbox"
                        bind:checked={book.bookInfo.autoSplitSentenceT}
                        onclick={() =>
                            progStorage.setAutoSplitSentence(
                                book.bookID,
                                !book.bookInfo.autoSplitSentenceT,
                                "t",
                            )}
                    />
                </td>

                <td
                    title={tomatoI18n.断句为无序表 +
                        !!book.bookInfo.autoSplitSentenceI}
                >
                    <input
                        type="checkbox"
                        bind:checked={book.bookInfo.autoSplitSentenceI}
                        onclick={() =>
                            progStorage.setAutoSplitSentence(
                                book.bookID,
                                !book.bookInfo.autoSplitSentenceI,
                                "i",
                            )}
                    />
                </td>

                <td>
                    <button
                        title="《{book.row.content}》"
                        class="b3-button b3-button--outline"
                        onclick={() => btnStartToLearn(book.bookID)}>📖</button
                    >
                </td>
                <td>
                    <button
                        title="{tomatoI18n.删除}《{book.row
                            .content}》（{tomatoI18n.不删除已经产生的分片等文件}）"
                        class="b3-button b3-button--outline"
                        onclick={() =>
                            btnConfirm(book.bookID, book.row.content)}
                        >🗑️</button
                    >
                </td>
                <td>
                    <button
                        title="{tomatoI18n.立刻创建所有的分片}《{book.row
                            .content}》"
                        class="b3-button b3-button--outline"
                        onclick={() => {
                            confirm(tomatoI18n.立刻创建所有的分片, "⏳", () => {
                                createAllPieces(book.bookID);
                            });
                        }}>🧩</button
                    >
                </td>
                <td>
                    <button
                        title="{tomatoI18n.天数}《{book.row.content}》"
                        class="b3-button b3-button--outline"
                        onclick={() => {
                            book.bookInfo.finishShowInput =
                                !book.bookInfo.finishShowInput;
                        }}
                        >{book.bookInfo.finishDays
                            ? book.bookInfo.finishDays
                            : "🗓️"}</button
                    >
                    <DialogSvelte
                        title="{tomatoI18n.天数}《{book.row.content}》"
                        bind:show={book.bookInfo.finishShowInput}
                    >
                        {#snippet dialogInner()}
                            <input
                                type="number"
                                min="0"
                                required
                                class="b3-text-field"
                                bind:value={book.bookInfo.finishDays}
                            />
                            <button
                                class="b3-button b3-button--outline"
                                onclick={() => {
                                    book.bookInfo.finishShowInput = false;
                                    progStorage.setFinishDays(
                                        book.bookID,
                                        validateNum(
                                            book.bookInfo.finishDays,
                                            0,
                                        ),
                                    );
                                }}>💾</button
                            >
                        {/snippet}
                    </DialogSvelte>
                </td>
                <td>
                    <button
                        title="{tomatoI18n.重新分片}《{book.row.content}》"
                        class="b3-button b3-button--outline"
                        onclick={() =>
                            btnAddProgressiveReadingWithLock(book.bookID)}
                        >🍕</button
                    >
                </td>
            </tr>
        {/each}
    </tbody>
</table>

<style>
    .finishedIgnore {
        background-color: var(--b3-font-background8);
    }
</style>
