# 图片资源文件夹

## 使用说明

将菜品图片放在此文件夹中，然后在 `src/data/menu.ts` 中引用。

### 图片命名建议

建议使用拼音或英文命名，例如：
- `hongshaorou.jpg` - 红烧肉
- `gongbaojiding.jpg` - 宫保鸡丁
- `mapodoufu.jpg` - 麻婆豆腐
- `yuxiangrousi.jpg` - 鱼香肉丝
- `daopaihuanggua.jpg` - 刀拍黄瓜
- `fuqifeipian.jpg` - 夫妻肺片
- `koushuiji.jpg` - 口水鸡
- `yangzhouchaofan.jpg` - 扬州炒饭
- `zhajiangmian.jpg` - 炸酱面
- `yangchunmian.jpg` - 阳春面
- `suanmeitang.jpg` - 酸梅汤
- `bingfeng.jpg` - 冰峰
- `juhuacha.jpg` - 菊花茶
- `shengjianbao.jpg` - 生煎包
- `chunjuan.jpg` - 春卷

### 在代码中引用

在 `src/data/menu.ts` 中，将 `imageUrl` 改为：

```typescript
imageUrl: "/images/hongshaorou.jpg"
```

### 图片格式建议

- 格式：JPG 或 PNG
- 尺寸：建议 800x600 或 400x300（宽高比 4:3）
- 大小：每张图片建议不超过 500KB，以提升加载速度

### 图片优化工具推荐

- [TinyPNG](https://tinypng.com/) - 在线压缩
- [Squoosh](https://squoosh.app/) - Google 出品的图片优化工具
