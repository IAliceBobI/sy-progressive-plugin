<script lang="ts">
    import { Dialog, IProtyle } from "siyuan";
    import { onDestroy, onMount } from "svelte";
    import { events } from "../../sy-tomato-plugin/src/libs/Events";
    import { DigestBuilder, getDigestMd } from "./digestUtils";
    import {
        attrNewLine,
        getAllText,
        siyuan,
    } from "../../sy-tomato-plugin/src/libs/utils";
    import { digestProgressiveBox } from "./DigestProgressiveBox";
    import { WordBuilder } from "./wordsUtils";
    import { pinyinAll } from "../../sy-tomato-plugin/src/libs/docUtils";
    import { domNewLine } from "../../sy-tomato-plugin/src/libs/sydom";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    export let dialog: Dialog = null;
    export let protyle: IProtyle;
    export let settings: TomatoSettings;

    let di = new DigestBuilder();
    let word = new WordBuilder(settings);
    let singleCard = false;
    let seletedText = "";
    let anchorID = "";

    onMount(async () => {
        const s = await events.selectedDivs(protyle);
        di.protyle = protyle;
        di.settings = settings;
        di.element = s.element;
        di.docID = s.docID;
        di.docName = s.docName;
        di.anchorID = s.ids[s.ids.length - 1];
        di.selected = s.selected;
        di.boxID = s.boxID;
        di.plugin = digestProgressiveBox.plugin;
        di.otab = digestProgressiveBox.singleTab;
        await di.init();
        singleCard = di.singleCard;

        word.plugin = digestProgressiveBox.plugin;
        word.anchorID = di.anchorID;
        word.docID = s.docID;
        word.boxID = s.boxID;
        word.docName = s.docName;
        word.rangeText = s.rangeText;
        word.bookID = di.bookID;
        word.allText = di.allText;

        const text = s.rangeText.trim();
        if (text) seletedText = text;
        else seletedText = getAllText(s.selected);

        anchorID = s.ids[0];

        digestProgressiveBox.digestCallback = async () => {
            digestProgressiveBox.digestCallback = null;
            await di.digest();
            destroy();
        };
    });

    onDestroy(destroy);

    function destroy() {
        dialog?.destroy();
    }

    function openBrowser(t: string) {
        window.open(`https://youdao.com/result?word=${t}&lang=en`, "_blank");
        window.open(
            `https://www.shenyandayi.com/wantQuotesResult?lang=zh&query=${t}&mode=1&category=2001&category_s=%255B%22200102%22%252C%22200104%22%255D&categorySearch=1`,
            "_blank",
        );
        window.open(`https://www.baidu.com/s?wd=${t}`, "_blank");
        window.open(
            `https://www.zhihu.com/search?type=content&q=${t}`,
            "_blank",
        );
        window.open(
            `https://www.bing.com/search?q=${t}+meaming&FORM=AWRE`,
            "_blank",
        );
    }
</script>

<!-- https://learn.svelte.dev/tutorial/if-blocks -->
<div class="protyle-wysiwyg">
    <table>
        <tbody>
            <tr>
                <td>
                    <button
                        title="{tomatoI18n.摘抄}(Alt+Z)"
                        class="b3-button"
                        on:click={async () => {
                            await di.digest();
                            destroy();
                        }}>🍕</button
                    >
                </td>
                <td>
                    <button
                        title="{tomatoI18n.摘抄}&{tomatoI18n.断句}"
                        class="b3-button"
                        on:click={async () => {
                            await di.digest(true);
                            destroy();
                        }}>✂</button
                    >
                </td>
                <td>
                    <button
                        title={tomatoI18n.查看摘抄轨迹链}
                        class="b3-button"
                        on:click={async () => {
                            await di.getDigestLnk();
                            destroy();
                        }}>🌲</button
                    >
                </td>
            </tr>
            <tr>
                <td>
                    <button
                        title={tomatoI18n.摘录单词}
                        class="b3-button"
                        on:click={async () => {
                            destroy();
                            await word.digest();
                        }}>🔤</button
                    >
                </td>
                <td>
                    <button
                        title={tomatoI18n.摘录单词并加入闪卡}
                        class="b3-button"
                        on:click={async () => {
                            destroy();
                            await word.digest(true);
                        }}>🗂️</button
                    >
                </td>
                <td>
                    <button
                        title={tomatoI18n.摘录单词并加入闪卡并用AI解释}
                        class="b3-button"
                        on:click={async () => {
                            destroy();
                            await word.digest(true, true);
                        }}>🤖</button
                    >
                </td>
            </tr>
            <tr>
                <td
                    ><button
                        title={tomatoI18n.打开前一个摘抄}
                        class="b3-button"
                        on:click={async () => {
                            await di.gotoDigest("<", "desc");
                            destroy();
                        }}>👈</button
                    >
                </td>
                <td>
                    <button
                        title={tomatoI18n.打开下一个摘抄}
                        class="b3-button"
                        on:click={async () => {
                            await di.gotoDigest(">", "asc");
                            destroy();
                        }}>👉</button
                    >
                </td>
                <td>
                    <button
                        title={tomatoI18n.清理已经完成的摘抄}
                        class="b3-button"
                        on:click={async () => {
                            await di.cleanDigest();
                            destroy();
                        }}>🗑️</button
                    >
                </td>
            </tr>
            <tr>
                <td colspan="2">
                    <button
                        title={tomatoI18n.切换单卡多卡模式}
                        class="b3-button"
                        on:click={async () => {
                            await di.toggleMultiCardMode();
                            destroy();
                        }}
                    >
                        {#if singleCard}
                            <span title={tomatoI18n.只有一个摘抄加入闪卡}
                                >🍎</span
                            >
                        {:else}
                            <span title={tomatoI18n.每个摘抄都加入闪卡}
                                >🍎🍎</span
                            >
                        {/if}</button
                    ></td
                >
                <td>
                    <button
                        title={tomatoI18n.标记摘抄为完成状态并转移闪卡到其他摘抄}
                        class="b3-button"
                        on:click={async () => {
                            if (di.ctime) {
                                await di.finishDigest();
                            } else {
                                await siyuan.pushMsg(
                                    `《${di.docName}》${tomatoI18n.这并不是一个摘抄}`,
                                );
                            }
                            destroy();
                        }}>🔨</button
                    >
                </td>
            </tr>
            <tr>
                <td colspan="3">
                    <button
                        title={tomatoI18n.断句并插入下方}
                        class="b3-button"
                        on:click={async () => {
                            let { md } = await getDigestMd(
                                settings,
                                di.selected,
                                di.protyle,
                                true,
                                false,
                            );
                            md.splice(0, 0, attrNewLine());
                            md.push(attrNewLine());
                            md = md.map((i) => {
                                i = i.split("\n").slice(0, -1).join("\n");
                                return domNewLine(i).outerHTML;
                            });
                            await siyuan.insertBlocksAfter(md, di.anchorID);
                            destroy();
                        }}>✂👇</button
                    >
                    <button
                        title="{tomatoI18n.断句并插入下方}(checkbox)"
                        class="b3-button"
                        on:click={async () => {
                            const { md } = await getDigestMd(
                                settings,
                                di.selected,
                                di.protyle,
                                true,
                                false,
                                true,
                            );
                            md.splice(0, 0, attrNewLine());
                            md.push(attrNewLine());
                            await siyuan.insertBlockAfter(
                                md.join("\n"),
                                di.anchorID,
                            );
                            destroy();
                        }}>📌👇</button
                    >
                </td>
            </tr>
            <tr
                ><td colspan="3">
                    <button
                        title={tomatoI18n.在上方插入汉语拼音}
                        class="b3-button"
                        on:click={async () => {
                            const { onePY, allPY } = pinyinAll(
                                seletedText,
                                "_",
                            );
                            if (allPY != onePY) {
                                await siyuan.insertBlockBefore(allPY, anchorID);
                            }
                            await siyuan.insertBlockBefore(onePY, anchorID);
                            destroy();
                        }}>pīn</button
                    >
                    <button
                        title={tomatoI18n.上网查询所选内容}
                        class="b3-button"
                        on:click={async () => {
                            openBrowser(seletedText);
                            destroy();
                        }}>🌐</button
                    >
                    <button
                        title={"baidu AI"}
                        class="b3-button"
                        on:click={async () => {
                            window.open(
                                `https://chat.baidu.com/search?word=${seletedText}`,
                                "_blank",
                            );
                            destroy();
                        }}>AI</button
                    >
                </td>
            </tr>
        </tbody>
    </table>
</div>

<style>
</style>
