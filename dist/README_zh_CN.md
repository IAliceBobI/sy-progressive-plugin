[English](https://github.com/IAliceBobI/sy-progressive-plugin/blob/main/README.md)

## [doc 帮助文档 👈](https://awx9773btw.feishu.cn/docx/ZZr9dGoIno5pnVxn2vpch6BCn3f?from=from_copylink)

# [issue 反馈 交流 QQ频道](https://pd.qq.com/s/2fh7nh7gz)

# [CHANGELOG](https://awx9773btw.feishu.cn/docx/Cm7nd2G9KoJhOjxGACycvJU6nRg?from=from_copylink)

# 基于`摘抄`的渐进阅读（摘抄模式）

## 使用方法


  
  <img src="assets/digest1.gif" alt="drawing" width="800"/>
  
  **默认快捷键：`Alt+Z`。** 这是一个菜单，里面有多个功能。
  
  只读模式也可以用，用快捷键 `Alt+Z`。
  
  可对任何文档进行摘抄，一般对导入的书籍作渐进阅读用。
  
  阅读时为了尽量不打断阅读，可以先摘抄觉得好的内容，所摘抄的内容会在后续闪卡复习时出现。
  
  选中多行然后使用`Alt+Z -> 🍕摘抄` 或者 `Alt+Z -> ✂ 摘抄并按照标点断句`。
  
  可对摘抄进行再摘抄，可无限套娃。
  
  摘抄出来的文档与`分片模式`中`分片`的功能与样式一样。
  
  > **连续两次按下快捷键 `Alt+Z`，触发摘抄。**



## 轻量级


  
  相对于`分片模式`，没有自动分片环节，在文档中选择多个内容块，就可做摘抄。
  
  相当于手动挡的`分片`。划选内容块就可创建`分片`。
  
  > **提示：** 可以对`分片模式`产生的`分片`使用摘抄。
  
  > **提示：** `摘抄模式`可与`分片模式`同时使用。



## 扁平化


  
  多级摘抄并不会产生多级文件夹。全部摘抄都在同一个文件夹内。



## 单词 & 闪卡


  
  <img src="assets/createWords.gif" alt="drawing" width="800"/>



## 制卡


  
  <img src="assets/createCard1.gif" alt="drawing" width="800"/>
  
  只读模式也可以用，用快捷键。
  
  摘抄可以看作是草稿，可以写写画画，然后制卡。
  
  制卡可以使用下文介绍的 ``` 写作式闪卡Alt+` ``` 、`制卡Alt+E` 、 ``` Daily Card Alt+S 与 Alt+` ```



## 复习


  
  推荐使用`番茄工具箱`的`toolbar`中的`闪卡按钮`。这种`tab`的方式复习闪卡，可以方便做摘抄。



## 闪卡转移策略(多)


  
  每个摘抄都制卡。
  
  > `Alt+Z -> 🗃️` 可以切换为`单`模式。
  > 每本书籍有自己的`闪卡转移策略`。



## 闪卡转移策略(单)


  
  > `Alt+Z -> 🗃️` 可以切换为`多`模式。
  
  每做一次摘抄都会维护摘抄的闪卡。
  
  一本书籍（一个文档）的所有摘抄中，只有一个摘抄有闪卡。
  
  此策略决定，哪个摘抄获得闪卡，以便在闪卡复习中出现此摘抄。
  
  在创建摘抄时，闪卡总是转移到最新创建的闪卡上。
  
  在`Alt+z`中对闪卡点击`Alt+Z -> 🔨`后，此摘抄被标记为`完成`状态，闪卡将转移到其他一个`未完成`状态的摘抄上。
  
  考虑到，可能出现到文档树中，手动选择任意摘抄来学习，所以定义下面的策略，方便自由探索后的回溯：
  
  当前摘抄的闪卡优先转移到，比自己老的摘抄上，并且是时间上离自己最近的一个老摘抄，并打开其。
  
  如果没有，闪卡会转移到最新创建的那个摘抄上，并打开其。
  
  如果一个`未完成`状态的摘抄都没有了，则会跳转到刚刚点`Alt+Z -> 🔨`的摘抄对应的原文内容块处。
  
  > 闪卡的复习次数不会累计，每次转移都清空。
  
  > 新闪卡会自动点一次困难，并把到期时间拉回当前(与`番茄工具箱`的`阅读点`策略一致)，可立刻复习。
  > 此操作是为了，调整各个难度对应的，下次复习时间。



## 打开上一个、下一个摘抄


  
  `Alt+Z -> 👈` `Alt+Z -> 👉`
  
  在某个摘抄上使用此功能，将打开原文上距离相近的摘抄。



## 清理已经完成的摘抄


  
  在任何一个摘抄文件内使用：
  
  `Alt+Z -> 🗑️`将删除完成状态的摘抄文件。



## 摘抄轨迹链`Alt+Z -> 🌲`


  
  <img src="assets/ditestTree.gif" alt="drawing" width="800"/>
  
  在任何一个摘抄文件内使用：
  
  `Alt+Z -> 🌲`将打开轨迹文件。每一行代表一个摘抄的路径，路径上每个节点都是一个摘抄文件，最终将指向原文。
  
  ![alt text](assets/digestTrace.png)





## 制作闪卡

### 制作挖空卡`Alt+E`



光标选择要`挖空`的一段内容，比如图中：

<img src="assets/selected.png" alt="drawing" width="700"/>

闪卡将创建到右边的新文件中，并打开文件。

闪卡以列表的形式被创建，方便在下方写下自己的心得。

<img src="assets/card.png" alt="drawing" width="900"/>

有些闪卡，我们可以用引用的方式打上N个标签，空格隔开，下图就打上了一个标签：

<img src="assets/refLeading.png" alt="drawing" width="700"/>

这样可以在引用的反链面板查看到所有相关内容。

我们通过闪卡机制持续思考与渐进写作。

<img src="assets/bk.png" alt="drawing" width="500"/>

> 推荐配合`番茄工具箱`的`闪卡优先级`功能、`底部反链`功能。

> [打不开图片请看这里](https://gitee.com/TokenzQdBN/sy-progressive-plugin/blob/main/README_zh_CN.md)



### 直接制卡，不挖空，还是`Alt+E`



直接把光标放在内容中，不做选择，用菜单或者快捷键制作闪卡即可。



### 多行选择，还是`Alt+E`



下图选中两行：

<img src="assets/multilines.png" alt="drawing" width="500"/>

> 使用快捷键： `Alt+E`

则生成并且插入闪卡于下方，如图：

<img src="assets/multilinesCard.png" alt="drawing" width="500"/>

> **提示** 如果是在分片中制卡，则卡片会放到书籍的子文件里。比如书籍名为ABC，则卡都收集到ABC-cards文件中。



### Daily Card`Alt+S`或者``` Ctrl+` ```



右键菜单或者快捷键 ``` Ctrl+` 引用原文 or Alt+S 不引用原文 ``` 可以制卡，并且把卡片归档到 Daily Card 文件夹下。结果类似 Daily Note。

<img src="assets/dailyCardMenu.png" alt="drawing" width="300"/>

将创建目录结构如下，并制卡：

![Alt text](assets/dailyCardTree.png)



### 写作式闪卡``` Alt+` ```



<img src="assets/writingCardInit.png" alt="drawing" width="800"/>

创建后，原文处也插入闪卡的嵌入块，在闪卡中做的内容，也反应到原文。

<img src="assets/writingCard.png" alt="drawing" width="1000"/>



### 多行挖空 `Alt+D`



<img src="assets/multilineblank.gif" alt="drawing" width="800"/>

可以删除官方的`Alt+D`，插件的`Alt+D`自动生效。

实现官方挖空功能，以及增加多行挖空功能。

选中多行，`Alt+D`即可。

在复习闪卡时，挖空的内容会被当做答案，被隐藏起来。



## 命令面板工具

替换`*`与`@`为超链接`siyuan://`。快捷键`F9`。




## 搜集功能`alt+shift+z`
可把各个分片中，选择中内容，复制到`summary-*`文件。
方便把分片内，分片之间相隔较远的内容放一起分析与总结。
对于需要前后对照着看的书籍，有较大的帮助。
如果不在分片内使用，则搜集到 daily note.



## 仿写练习流程



仿写练习流程，也可以叫翻译练习流程。

### 第一步

在分片内，每个原文内容块下方，用最简洁的语言，概括或者罗列原文要点，或者翻译原文。

然后右键`提取笔记`。

不出意外，会在分片下方生成一个`keys-`开头的文件。

<img src="assets/practiceExtract.png" alt="drawing" width="1000"/>

> [打不开图片请看这里](https://gitee.com/TokenzQdBN/sy-progressive-plugin/blob/main/README_zh_CN.md)

### 第二步

在`keys-`开头的文件内，根据之前自己的概括、翻译，用自己的语言重写原文。

<img src="assets/rewrite.png" alt="drawing" width="1000"/>

最后，在`keys-`文件内，右键`对比原文`。

不出意外，会在分片下方生成一个`compare-`开头的文件。

<img src="assets/compare.png" alt="drawing" width="1000"/>





# 其他



## 改变分片笔记的颜色

添加下面的代码片段，颜色部分`#b33131`自己改。

```
.protyle-wysiwyg div[custom-progref][custom-paragraph-index]:not([custom-prog-origin-text]):not([custom-prog-key-note]) {
color: #b33131;
}
```

## 改变提取的笔记的颜色

添加下面的代码片段，颜色部分`#b33131`自己改。

```
.protyle-wysiwyg div[custom-prog-key-note] {
color: #b33131;
}
```



# 鸣谢

* 2024-11 [爱发电用户_35865](https://afdian.com/u/35865882c7e411ed8b3b5254001e7c00)
* 2024-11 [Tisamn](https://afdian.com/u/cef7f2e42a0f11efb03952540025c377)
* 2024-10 `Nnf`
* 2024-10 `**强`
* 2024-10 Sonetto
* 2024-09 星愿无辰
* 2024-09 [Tisamn](https://afdian.com/u/cef7f2e42a0f11efb03952540025c377)
* 2024-08 `edapan`
* 2024-08 `**生`
* 2024-08 [虚青海](https://afdian.com/a/xqh042)
* 2024-08 `duanduan`
* 2024-07 `凭风引`
* 2024-07 `**岚`
* 2024-06 [虚青海](https://afdian.com/a/xqh042)
* 2024-06 [爱发电用户_jykN](https://afdian.com/u/20b38264295811efb0695254001e7c00)
* 2024-06 `雨`
* 2024-06 `*超`
* 2024-06 `**峰`
* 2024-06 [固元膏v](https://afdian.com/u/d1fe450cbf4b11ea9ffa52540025c377)
* 2024-05 `*超`
* 2024-05 `**瑞`
* 2024-05 `**瑞`
* 2024-05 `**刚`
* 2024-05 `*驰`
* 2024-05 [盐酸有点咸](https://afdian.com/u/379a287008a111efa3c552540025c377)
* 2024-04 `*江`
* 2024-04 [无糖](https://afdian.com/u/7eefa1207fe711ee971552540025c377)
* 2024-04 `典典`
* 2024-03 `**清`
* 2024-03 [JeffreyChen](https://afdian.com/a/JeffreyChen)
* 2024-03 `八面来风`
* 2024-03 `**清`
* 2024-03 `*理`
* 2024-02 `八面来风`
* 2024-02 `*5770`
* 2024-02 `**轩`
* 2024-02 `**航`
* 2024-02 `**航`
* 2024-02 `**龙`
* 2024-02 `**棉`
* 2024-01 [QQQOrange](https://afdian.com/u/2c73a3c6a1f011eeb98a52540025c377)
* 2024-01 `燃烬`
* 2024-01 `*舟`
* 2024-01 `*元`
* 2024-01 [赐我一胖](https://afdian.com/u/74d98cf66f0711eda8ca52540025c377)
* 2023-12 [爱发电用户_WGH7](https://afdian.com/u/ceefbee4a48111ee983f5254001e7c00)
* 2023-12 [爱发电用户_Pv38](https://afdian.com/u/3911fecaa3ad11ee8fa95254001e7c00)
* 2023-12 [赐我一胖](https://afdian.com/u/74d98cf66f0711eda8ca52540025c377)
* 2023-12 [QQQOrange](https://afdian.com/u/2c73a3c6a1f011eeb98a52540025c377)
* 2023-12 [没头脑和不高兴](https://afdian.com/u/25e08b1eb1a511edbb3d5254001e7c00)
* 2023-12 [爱发电用户_EbBe](https://afdian.com/u/d11e3c741bc711ee95eb52540025c377)
* 2023-12 [爱发电用户_b2864](https://afdian.com/u/b286492496af11eea38752540025c377)



# 打赏、鼓励、催更 🎉

<div>
<img src="https://player-pubpic.oss-cn-beijing.aliyuncs.com/static/wx1.png" alt="alipay" width="300" />
</div>
<br>
<div>
<img src="https://player-pubpic.oss-cn-beijing.aliyuncs.com/static/zfb1.jpg" alt="wechat" width="300" />
</div>
