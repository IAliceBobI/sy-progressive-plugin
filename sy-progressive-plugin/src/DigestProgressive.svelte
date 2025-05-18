<script lang="ts">
    import { IProtyle, Plugin } from "siyuan";
    import { onDestroy, onMount } from "svelte";
    import { events } from "../../sy-tomato-plugin/src/libs/Events";
    import { DigestBuilder, getDigestMd } from "./digestUtils";
    import {
        attrNewLine,
        getAllText,
        setTimeouts,
        siyuan,
    } from "../../sy-tomato-plugin/src/libs/utils";
    import { digestProgressiveBox, initDi } from "./DigestProgressiveBox";
    import { WordBuilder } from "./wordsUtils";
    import {
        getDocTracer,
        pinyinAll,
    } from "../../sy-tomato-plugin/src/libs/docUtils";
    import { domNewLine } from "../../sy-tomato-plugin/src/libs/sydom";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { SelectionML } from "../../sy-tomato-plugin/src/libs/SelectionML";
    import { addFlashCard } from "../../sy-tomato-plugin/src/libs/listUtils";
    import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

    export let protyle: IProtyle;
    export let plugin: Plugin;
    export let settings: TomatoSettings;
    export let dm: DestroyManager;
    export let isDouble: boolean;

    let tableTools: HTMLElement;
    let tableSelect: HTMLElement;
    let di: DigestBuilder;
    let word = new WordBuilder(settings);
    let selectionMl: SelectionML;
    let cardMode = "0";
    let seletedText = "";
    let anchorID = "";
    let needReinit = true;

    async function init() {
        if (!needReinit) return;
        needReinit = false;

        const s = await events.selectedDivs(protyle);

        di = await initDi(s, protyle, settings);
        cardMode = di.cardMode;

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

        if (isDouble && events.isMobile) {
            tableTools.style.display = "none";
            tableSelect.style.display = null;
            setTimeouts(
                () => {
                    tableSelect.focus();
                },
                300,
                2000,
                500,
            );
        } else {
            tableTools.style.display = "none";
        }
    }

    function hideTr() {
        if (tableSelect.style.display == "none") {
            tableSelect.style.display = null;
            tableTools.style.display = "none";
        } else {
            tableSelect.style.display = "none";
            tableTools.style.display = null;
        }
    }

    onMount(async () => {
        const s = await events.selectedDivs(protyle);
        selectionMl = new SelectionML(s);
        await init();

        digestProgressiveBox.digestCallback = async () => {
            digestProgressiveBox.digestCallback = null;
            await di.digest();
            destroy();
        };
    });

    onDestroy(destroy);

    function destroy() {
        dm.destroyBy("2");
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

    async function splitParagph() {
        const lines = getAllText(di.selected, "\n")
            .split("\n")
            .map((i) => domNewLine(i).outerHTML);
        const ops = siyuan.transInsertBlocksAfter(lines, anchorID);
        ops.push(...siyuan.transDeleteBlocks(di.ids));
        await siyuan.transactions(ops);
        destroy();
    }
    async function mergeParagph() {
        const text = getAllText(di.selected, "\n");
        const l = domNewLine(text).outerHTML;
        const ops = siyuan.transInsertBlocksAfter([l], di.ids.at(-1));
        // ops.push(...siyuan.transDeleteBlocks(di.ids));
        await siyuan.transactions(ops);
        destroy();
    }
</script>

<!-- https://learn.svelte.dev/tutorial/if-blocks -->

<table bind:this={tableSelect}>
    <tbody>
        <tr>
            <td>
                <button
                    class="b3-button"
                    title={tomatoI18n.向上选择}
                    on:click={() => {
                        selectionMl.selectUp();
                        needReinit = true;
                    }}>⏫</button
                >
            </td>
            <td>
                <button
                    class="b3-button"
                    title={tomatoI18n.向下选择}
                    on:click={() => {
                        selectionMl.selectDown();
                        needReinit = true;
                    }}>⏬</button
                >
            </td>
            <td>
                <button
                    title="{tomatoI18n.执行摘抄}(Alt+Z)"
                    class="b3-button"
                    on:click={async () => {
                        await init();
                        await di.digest();
                        destroy();
                    }}>🍕</button
                >
            </td>
            <td>
                <button
                    title="{tomatoI18n.用选中的行创建超级块超级块制卡取消制卡}(Alt+Z)"
                    class="b3-button"
                    on:click={async () => {
                        const id = await addFlashCard(
                            protyle,
                            await getDocTracer(),
                            plugin,
                            await verifyKeyProgressive(),
                        );
                        if (id) await siyuan.addRiffCards([id]);
                        destroy();
                    }}>💳</button
                >
            </td>
            <td>
                <button
                    class="b3-button"
                    title={tomatoI18n.显示与隐藏工具}
                    on:click={hideTr}>🔧</button
                >
            </td>
        </tr>
    </tbody>
</table>

<table class="protyle-wysiwyg" bind:this={tableTools}>
    <tbody>
        <tr>
            <td>
                <button
                    title="{tomatoI18n.执行摘抄}(Alt+Z)"
                    class="b3-button"
                    on:click={async () => {
                        await init();
                        await di.digest();
                        destroy();
                    }}>🍕</button
                >
            </td>
            <td>
                <button
                    title="{tomatoI18n.执行摘抄}&{tomatoI18n.断句}"
                    class="b3-button"
                    on:click={async () => {
                        await init();
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
                        await init();
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
                        await init();
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
                        await init();
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
                <select
                    class="b3-select"
                    bind:value={cardMode}
                    on:change={() => {
                        di.cardMode = cardMode;
                        di.saveCardMode();
                    }}
                >
                    <option value="0" title={tomatoI18n.摘抄不加入闪卡}>
                        🚫💳
                    </option>
                    <option
                        value="1"
                        title={tomatoI18n.只有最新的一个摘抄加入闪卡}
                    >
                        💳
                    </option>
                    <option value="2" title={tomatoI18n.每个摘抄都加入闪卡}>
                        💳💳
                    </option>
                </select>
            </td>
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
                    title={tomatoI18n.按照标点符号断句并插入下方}
                    class="b3-button"
                    on:click={async () => {
                        await init();
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
                    title="{tomatoI18n.按照标点符号断句并插入下方}(checkbox)"
                    class="b3-button"
                    on:click={async () => {
                        await init();
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
        <tr>
            <td colspan="3">
                <button
                    title={tomatoI18n.按照回车拆分为多个段落块}
                    class="b3-button"
                    on:click={async () => {
                        await init();
                        await splitParagph();
                        destroy();
                    }}>✂📄</button
                >
                <button
                    title={tomatoI18n.合并为单个段落块}
                    class="b3-button"
                    on:click={async () => {
                        await init();
                        await mergeParagph();
                        destroy();
                    }}>📦📄</button
                >
            </td>
        </tr>
        <tr
            ><td colspan="3">
                <button
                    title={tomatoI18n.在上方插入汉语拼音}
                    class="b3-button"
                    on:click={async () => {
                        await init();
                        const { onePY, allPY } = pinyinAll(seletedText, "_");
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
                        await init();
                        openBrowser(seletedText);
                        destroy();
                    }}>🌐</button
                >
                <button
                    title={"baidu AI"}
                    class="b3-button"
                    on:click={async () => {
                        await init();
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
