/* 1. expressモジュールをロードし、インスタンス化してappに代入。*/
import puppeteer from "puppeteer";
import express from "express";
import cors from "cors";
import axios from "axios";
var app = express();

app.use(cors());
app.use(express.json()); // body-parser settings

/* 2. listen()メソッドを実行して3000番ポートで待ち受け。*/
var server = app.listen(3001, function () {
  console.log("Node.js is listening to PORT:" + server.address().port);
});

/* 3. 以後、アプリケーション固有の処理 */

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

app.post("/api/mapping", async (req, res, next) => {
  if (!req.body.data) {
    res.status(200);
    return;
  }
  const startTime = performance.now(); // 開始時間

  const url = req.body.data;

  const options = {
    headless: true,
  };
  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();
  await page.goto(url);
  console.log("loading page ...");
  await sleep(3000);

  const getTextContentFromElemHandler = async (elementHandle) => {
    const textContentProperty = await elementHandle.getProperty("textContent");
    return textContentProperty.jsonValue();
  };

  const getHrefFromElemHandler = async (elementHandle) => {
    const hrefProperty = await elementHandle.getProperty("href");
    return hrefProperty.jsonValue();
  };

  const extractInfoFromSinglePage = async (page) => {
    const elems = await page.$$("ul.l-cassetteitem > li");

    let propertyInfos = [];
    for await (const elem of elems) {
      // TODO: 複数の部屋の表示に対応する
      const trs = await elem.$$(".cassetteitem_other > tbody > tr");
      const tds = await trs[0].$$("td");

      // 階数
      const stairs = await getTextContentFromElemHandler(tds[2]);

      // 詳細リンク
      const detailUrlElemHandler = await tds[tds.length - 1].$("a");
      const detailUrl = await getHrefFromElemHandler(detailUrlElemHandler);

      // 画像URL
      const imgSrc = await elem.$eval("img.js-linkImage", (el) => el.src);

      // タイトル
      const titleElemHandler = await elem.$("div.cassetteitem_content-title");
      const title = await getTextContentFromElemHandler(titleElemHandler);

      // 住所
      const addressElemHandler = await elem.$(".cassetteitem_detail-col1");
      const address = await getTextContentFromElemHandler(addressElemHandler);

      // 賃料
      const rentElemHandler = await elem.$(".cassetteitem_other-emphasis");
      const rent = await getTextContentFromElemHandler(rentElemHandler);

      // 管理費
      const administrativeExpensesElemHandler = await elem.$(
        ".cassetteitem_price--administration"
      );
      const administrativeExpenses = await getTextContentFromElemHandler(
        administrativeExpensesElemHandler
      );

      // 敷金
      const depositElemHandler = await elem.$(".cassetteitem_price--deposit");
      const deposit = await getTextContentFromElemHandler(depositElemHandler);

      // 保証金
      const gratuityElemHandler = await elem.$(".cassetteitem_price--gratuity");
      const gratuity = await getTextContentFromElemHandler(gratuityElemHandler);

      // 間取り
      const planOfHouseElemHandler = await elem.$(".cassetteitem_madori");
      const planOfHouse = await getTextContentFromElemHandler(planOfHouseElemHandler);

      // 面積
      const areaElemHandler = await elem.$(".cassetteitem_menseki");
      const area = await getTextContentFromElemHandler(areaElemHandler);

      // 座標
      const makeUrl = "https://msearch.gsi.go.jp/address-search/AddressSearch";
      // const makeUrl_gas =
      //   "https://script.google.com/macros/s/AKfycbykhu8tYWMeQRuCvctpOc9yEi0N7goZLZChROAdMEKVuecYau0WLGWLAAlj3SEwPz8G/exec";
      const encodedURI = encodeURI(`${makeUrl}?q=${address}`);
      console.log('地理院地図の地名検索APIにリクエスト送信')
      const location_array = await axios
        .get(encodedURI)
        // .then((res) => res.data.geometry.location);
        .then((response) => response.data[0].geometry.coordinates);
      const location = { lng: location_array[0], lat: location_array[1] };

      propertyInfos.push({
        stairs,
        detailUrl,
        imgSrc,
        title,
        address,
        location,
        rent,
        administrativeExpenses,
        deposit,
        gratuity,
        planOfHouse,
        area,
      });

      await sleep(1000);
    }

    const navigationElemHandlers = await page.$$("p.pagination-parts > a");
    let nextElemHandler = null;
    for await (const navElemHandler of navigationElemHandlers) {
      const text = await getTextContentFromElemHandler(navElemHandler);
      if (text === "次へ") {
        nextElemHandler = navElemHandler;
      }
    }

    return [propertyInfos, nextElemHandler];
  };

  let propertyInfos = [];
  while (true) {
    // 現在のページから物件情報を抽出する
    console.log("現在のページから物件情報を抽出する");
    const [propertyInfosPerPage, nextElemHandler] =
      await extractInfoFromSinglePage(page);
    propertyInfos = [...propertyInfos, ...propertyInfosPerPage];
    if (nextElemHandler) {
      console.log("次へをクリック");
      nextElemHandler.click();
      await sleep(1500);
    } else break;
  }

  const endTime = performance.now(); // 終了時間
  console.log((endTime - startTime) / 1000, " [s]"); // 何ミリ秒かかったかを表示する

  await browser.close();

  res.status(200).send({
    data: propertyInfos,
  });
});
