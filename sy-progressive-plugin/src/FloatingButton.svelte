<!-- FloatingActionButton.svelte -->
<script lang="ts">
    import { onMount } from "svelte";
    import DigestProgressive from "./DigestProgressive.svelte";
    import { Plugin } from "siyuan";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";

    export let settings: TomatoSettings;
    export let plugin: Plugin;
    export let dm: DestroyManager;
    let offsetX: number;
    let offsetY: number;
    let innerWidth: number;
    let innerHeight: number;
    let button: HTMLElement;
    let isDragging = false;
    function key(k: string) {
        return k + " MtZMrnZLNJ6ZyHTcThSWj2N";
    }

    function loadPosition() {
        let x = localStorage.getItem(key("offsetX"));
        let y = localStorage.getItem(key("offsetY"));
        setPosition(x, y);
    }

    function setPosition(x?: string, y?: string) {
        if (!x) x = "200px";
        if (!y) y = "200px";
        button.style.left = x;
        button.style.top = y;
        innerWidth = window.innerWidth;
        innerHeight = window.innerHeight;
    }

    onMount(() => {
        loadPosition();
        button.addEventListener("mousedown", mousedown);
        button.addEventListener("touchstart", touchstart); // 添加触摸开始事件监听
        window.addEventListener("resize", resize);
        document.addEventListener("mousemove", mousemove);
        document.addEventListener("touchmove", touchmove); // 添加触摸移动事件监听
        document.addEventListener("mouseup", mouseup);
        document.addEventListener("touchend", touchend); // 添加触摸结束事件监听
        dm.add("EventListener", () => {
            button.removeEventListener("mousedown", mousedown);
            button.removeEventListener("touchstart", touchstart); // 移除触摸开始监听
            window.removeEventListener("resize", resize);
            document.removeEventListener("mousemove", mousemove);
            document.removeEventListener("touchmove", touchmove); // 移除触摸移动监听
            document.removeEventListener("mouseup", mouseup);
            document.removeEventListener("touchend", touchend); // 移除触摸结束监听
        });
    });

    // 触摸开始时触发（复用鼠标按下逻辑）
    // 修改触摸开始事件处理，避免拦截子按钮点击
    function touchstart(e: TouchEvent) {
        const target = e.target as HTMLElement;
        if (target.closest("button")) {
            return;
        }
        e.preventDefault(); // 仅在拖动悬浮球时阻止默认行为
        const touch = e.touches[0];
        mousedown({
            clientX: touch.clientX,
            clientY: touch.clientY,
        } as MouseEvent);
    }

    // 触摸移动时触发（复用鼠标移动逻辑）
    function touchmove(e: TouchEvent) {
        const touch = e.touches[0];
        mousemove({
            clientX: touch.clientX,
            clientY: touch.clientY,
        } as MouseEvent);
    }

    // 触摸结束时触发（复用鼠标抬起逻辑）
    function touchend() {
        mouseup();
    }

    function mouseup() {
        if (isDragging) {
            isDragging = false;
            localStorage.setItem(key("offsetX"), button.style.left);
            localStorage.setItem(key("offsetY"), button.style.top);
        }
        innerWidth = window.innerWidth;
        innerHeight = window.innerHeight;
    }

    function mousemove(e: MouseEvent) {
        if (isDragging) {
            button.style.left = `${e.clientX - offsetX}px`;
            button.style.top = `${e.clientY - offsetY}px`;
        }
    }

    function mousedown(e: MouseEvent) {
        isDragging = true;
        offsetX = e.clientX - button.offsetLeft;
        offsetY = e.clientY - button.offsetTop;
    }

    function resize() {
        let x = Number(button.style.left.slice(0, -2));
        let y = Number(button.style.top.slice(0, -2));
        x = (x * window.innerWidth) / innerWidth;
        y = (y * window.innerHeight) / innerHeight;
        if (x + 20 >= window.innerWidth) {
            button.style.left = window.innerWidth - 100 + "px";
        } else {
            button.style.left = x + "px";
        }
        if (y + 20 >= window.innerHeight) {
            button.style.top = window.innerHeight - 100 + "px";
        } else {
            button.style.top = y + "px";
        }
        innerWidth = window.innerWidth;
        innerHeight = window.innerHeight;
    }
</script>

<div class="floating-button" bind:this={button}>
    <DigestProgressive {settings} {plugin} isFloating={true}
    ></DigestProgressive>
</div>

<!-- <button class="floating-button" on:click={onClick} bind:this={button}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
</button> -->

<style>
    /* .floating-button svg {
        width: 28px;
        height: 28px;
    } */

    /* @media (max-width: 600px) {
        .floating-button {
            width: 50px;
            height: 50px;
            font-size: 20px;
        }
    } */

    .floating-button {
        position: fixed;
        /* right: 20px;
        bottom: 20px;
        width: 60px;
        height: 60px; */
        /* background-color: #6200ee; */
        border-radius: 50%;
        /* box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); */
        display: flex;
        align-items: center;
        justify-content: center;
        /* color: white; */
        /* font-size: 24px; */
        cursor: pointer;
        /* transition:
            transform 0.2s,
            box-shadow 0.2s; */
    }

    /* .floating-button:active {
        transform: scale(0.95);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    } */
</style>
