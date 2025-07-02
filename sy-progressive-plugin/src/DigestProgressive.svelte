<script lang="ts">
    import { IProtyle, Plugin, Protyle } from "siyuan";
    import { onDestroy, onMount } from "svelte";
    import { events, EventType } from "../../sy-tomato-plugin/src/libs/Events";
    import { DigestBuilder, getDigestMd } from "./digestUtils";
    import {
        attrNewLine,
        getAllText,
        icon,
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
    import { digestGlobalSigle } from "../../sy-tomato-plugin/src/libs/stores";
    import { getProgFloatingDm } from "./FloatingAction";
    import { ClickHelper } from "../../sy-tomato-plugin/src/libs/ClickHelper";

    export let protyle: IProtyle = null;
    export let dm: DestroyManager = null;
    export let isFloating: boolean = false;
    export let settings: TomatoSettings;
    export let plugin: Plugin;

    let tableTools: HTMLElement;
    let tableSelect: HTMLElement;
    let di: DigestBuilder;
    let word = new WordBuilder(settings);
    let selectionMl: SelectionML;
    let cardMode = "2";
    let seletedText = "";
    let firstID = "";
    let anchorID = "";
    let selectedInfo: ReturnType<typeof events.selectedDivsSync> = null;
    let btnHelper = new ClickHelper();

    function hideFlationBtn() {
        const e: HTMLElement = getProgFloatingDm()?.getData("e");
        if (e) {
            e.style.display = "none";
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
        if (protyle) {
            const s = events.selectedDivsSync(protyle);
            selectionMl = new SelectionML(s);
            await initSelMl();
            digestProgressiveBox.digestCallback = async () => {
                digestProgressiveBox.digestCallback = null;
                await di.digest();
                destroy();
            };
        }

        if (isFloating) {
            tableSelect.style.display = null;
            tableTools.style.display = "none";
        } else {
            tableSelect.style.display = "none";
            tableTools.style.display = null;
        }

        events.addListener(
            "floating 2025-5-18 21:36:08",
            (eventType, detail: Protyle) => {
                if (
                    eventType == EventType.loaded_protyle_static ||
                    eventType == EventType.loaded_protyle_dynamic ||
                    eventType == EventType.click_editorcontent ||
                    eventType == EventType.switch_protyle
                ) {
                    navigator.locks.request(
                        "lock 2025-5-18 21:35:55",
                        { mode: "exclusive" },
                        async (lock) => {
                            if (lock) {
                                const nextProtyle: IProtyle = detail.protyle;
                                if (!nextProtyle) return;
                                protyle = nextProtyle;
                                selectionMl = null;
                                initSelMl();
                            }
                        },
                    );
                }
            },
        );
    });

    async function initDigest() {
        selectedInfo = events.selectedDivsSync(protyle);
        di = await initDi(selectedInfo, protyle, settings);
        cardMode = di.cardMode;
    }

    async function initText() {
        selectedInfo = events.selectedDivsSync(protyle);
        firstID = selectedInfo.ids.at(0);
        anchorID = selectedInfo.ids.at(-1);
        const text = selectedInfo.rangeText.trim();
        if (text) seletedText = text;
        else seletedText = getAllText(selectedInfo.selected);
    }

    async function initWord() {
        await initDigest();
        word.plugin = digestProgressiveBox.plugin;
        word.anchorID = di.anchorID;
        word.docID = selectedInfo.docID;
        word.boxID = selectedInfo.boxID;
        word.docName = selectedInfo.docName;
        word.rangeText = selectedInfo.rangeText;
        word.bookID = di.bookID;
        word.allText = di.allText;
        const text = selectedInfo.rangeText.trim();
        if (text) seletedText = text;
        else seletedText = getAllText(selectedInfo.selected);
    }

    async function initSelMl() {
        selectedInfo = events.selectedDivsSync(protyle);
        if (selectedInfo.ids.length <= 0) return;
        selectionMl = new SelectionML(selectedInfo);

        // if (isDouble && events.isMobile) {
        //     tableTools.style.display = "none";
        //     tableSelect.style.display = null;
        //     setTimeouts(
        //         () => {
        //             tableSelect.focus();
        //         },
        //         300,
        //         2000,
        //         500,
        //     );
        // } else {
        //     tableSelect.style.display = "none";
        // }
    }

    onDestroy(destroy);

    export function destroy() {
        dm?.destroyBy("2");
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
        const lines = getAllText(selectedInfo.selected, "\n")
            .split("\n")
            .map((i) => domNewLine(i).outerHTML);
        const ops = siyuan.transInsertBlocksAfter(lines, anchorID);
        ops.push(...siyuan.transDeleteBlocks(selectedInfo.ids));
        await siyuan.transactions(ops);
    }
    async function mergeParagph() {
        const text = getAllText(selectedInfo.selected, "\n");
        const l = domNewLine(text).outerHTML;
        const ops = siyuan.transInsertBlocksAfter([l], selectedInfo.ids.at(-1));
        await siyuan.transactions(ops);
    }
</script>

<!-- https://learn.svelte.dev/tutorial/if-blocks -->

<table bind:this={tableSelect}>
    <tbody>
        <tr>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, () => {
                            selectionMl?.selectUp();
                        });
                    }}
                    disabled={selectionMl == null}
                    class="b3-button b3-button--outline"
                    title={tomatoI18n.向上选择}>⏫</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, () => {
                            selectionMl?.selectDown();
                        });
                    }}
                    disabled={selectionMl == null}
                    class="b3-button b3-button--outline"
                    title={tomatoI18n.向下选择}>⏬</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, () => {
                            selectionMl?.cancelLast();
                        });
                    }}
                    disabled={selectionMl == null}
                    class="b3-button b3-button--outline"
                    title={tomatoI18n.取消最后一次选择的内容}>✖️</button
                >
            </td>
        </tr>
        <tr>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            await di.digest();
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title="{tomatoI18n.执行摘抄}(Alt+Z)"
                    class="b3-button b3-button--outline">🍕</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            if (protyle) {
                                const id = await addFlashCard(
                                    protyle,
                                    await getDocTracer(),
                                    plugin,
                                    await verifyKeyProgressive(),
                                );
                                if (id) await siyuan.addRiffCards([id]);
                                destroy();
                            }
                        });
                    }}
                    disabled={selectionMl == null}
                    title="{tomatoI18n.用选中的行创建超级块超级块制卡取消制卡}(Alt+Z)"
                    class="b3-button b3-button--outline">💳</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, () => {
                            hideTr();
                        });
                    }}
                    class="b3-button b3-button--outline"
                    title={tomatoI18n.显示与隐藏工具}>🔧</button
                >
            </td>
            {#if isFloating}
                <td>
                    <button
                        on:mousedown={(event) => {
                            btnHelper.handleMouseDown(event);
                        }}
                        on:mouseup={(event) => {
                            btnHelper.handleMouseUp(event, () => {
                                hideFlationBtn();
                            });
                        }}
                        class="b3-button b3-button--outline"
                        title={tomatoI18n.关闭悬浮按钮双击可以再次打开}
                        >{@html icon("iconQuit", 5)}</button
                    >
                </td>
            {/if}
        </tr>
    </tbody>
</table>

<table class="protyle-wysiwyg" bind:this={tableTools}>
    <tbody>
        <tr>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            await di.digest();
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title="{tomatoI18n.执行摘抄}(Alt+Z)"
                    class="b3-button b3-button--outline">🍕</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            await di.digest(true);
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title="{tomatoI18n.执行摘抄}&{tomatoI18n.断句}"
                    class="b3-button b3-button--outline">✂</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            await di.getDigestLnk();
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.查看摘抄轨迹链}
                    class="b3-button b3-button--outline">🌲</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, () => {
                            hideTr();
                        });
                    }}
                    class="b3-button b3-button--outline"
                    title={tomatoI18n.显示与隐藏工具}>🔧</button
                >
            </td>
        </tr>
        <tr>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initWord();
                            destroy();
                            await word.digest();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.摘录单词}
                    class="b3-button b3-button--outline">🔤</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initWord();
                            destroy();
                            await word.digest(true);
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.摘录单词并加入闪卡}
                    class="b3-button b3-button--outline">🗂️</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initWord();
                            destroy();
                            await word.digest(true, true);
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.摘录单词并加入闪卡并用AI解释}
                    class="b3-button b3-button--outline">🤖</button
                >
            </td>
        </tr>
        <tr>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            await di.gotoDigest("<", "desc");
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.打开前一个摘抄}
                    class="b3-button b3-button--outline">👈</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            await di.gotoDigest(">", "asc");
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.打开下一个摘抄}
                    class="b3-button b3-button--outline">👉</button
                >
            </td>
            <td>
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            await di.cleanDigest();
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.清理已经完成的摘抄}
                    class="b3-button b3-button--outline">🗑️</button
                >
            </td>
        </tr>
        <tr>
            <td colspan="2">
                <select
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            di.cardMode = cardMode;
                            digestGlobalSigle.write(cardMode);
                            di.saveCardMode();
                        });
                    }}
                    disabled={selectionMl == null}
                    class="b3-select"
                    bind:value={cardMode}
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
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initDigest();
                            if (di.ctime) {
                                await di.finishDigest();
                            } else {
                                await siyuan.pushMsg(
                                    `《${di.docName}》${tomatoI18n.这并不是一个摘抄}`,
                                );
                            }
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.标记摘抄为完成状态并转移闪卡到其他摘抄}
                    class="b3-button b3-button--outline">🔨</button
                >
            </td>
        </tr>
        <tr>
            <td colspan="3">
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initText();
                            let { md } = await getDigestMd(
                                settings,
                                selectedInfo.selected,
                                protyle,
                                true,
                                false,
                            );
                            md.splice(0, 0, attrNewLine());
                            md.push(attrNewLine());
                            md = md.map((i) => {
                                i = i.split("\n").slice(0, -1).join("\n");
                                return domNewLine(i).outerHTML;
                            });
                            await siyuan.insertBlocksAfter(md, anchorID);
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.按照标点符号断句并插入下方}
                    class="b3-button b3-button--outline">✂👇</button
                >
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initText();
                            const { md } = await getDigestMd(
                                settings,
                                selectedInfo.selected,
                                protyle,
                                true,
                                false,
                                true,
                            );
                            md.splice(0, 0, attrNewLine());
                            md.push(attrNewLine());
                            await siyuan.insertBlockAfter(
                                md.join("\n"),
                                anchorID,
                            );
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title="{tomatoI18n.按照标点符号断句并插入下方}(checkbox)"
                    class="b3-button b3-button--outline">📌👇</button
                >
            </td>
        </tr>
        <tr>
            <td colspan="3">
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initText();
                            await splitParagph();
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.按照回车拆分为多个段落块}
                    class="b3-button b3-button--outline">✂📄</button
                >
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initText();
                            await mergeParagph();
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.合并为单个段落块}
                    class="b3-button b3-button--outline">📦📄</button
                >
            </td>
        </tr>
        <tr
            ><td colspan="3">
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initText();
                            const { onePY, allPY } = pinyinAll(
                                seletedText,
                                "_",
                            );
                            if (allPY != onePY) {
                                await siyuan.insertBlockBefore(allPY, firstID);
                            }
                            await siyuan.insertBlockBefore(onePY, firstID);
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.在上方插入汉语拼音}
                    class="b3-button b3-button--outline">pīn</button
                >
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initText();
                            openBrowser(seletedText);
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={tomatoI18n.上网查询所选内容}
                    class="b3-button b3-button--outline">🌐</button
                >
                <button
                    on:mousedown={(event) => {
                        btnHelper.handleMouseDown(event);
                    }}
                    on:mouseup={(event) => {
                        btnHelper.handleMouseUp(event, async () => {
                            await initText();
                            window.open(
                                `https://chat.baidu.com/search?word=${seletedText}`,
                                "_blank",
                            );
                            destroy();
                        });
                    }}
                    disabled={selectionMl == null}
                    title={"baidu AI"}
                    class="b3-button b3-button--outline">AI</button
                >
            </td>
        </tr>
    </tbody>
</table>

<style>
</style>
