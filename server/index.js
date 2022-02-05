/* 1. expressモジュールをロードし、インスタンス化してappに代入。*/
import puppeteer from "puppeteer";
import express from "express";
import cors from "cors";
import axios from "axios";
import xml2js from "xml2js";
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

const R = Math.PI / 180;
const calcDistance = (lat1, lng1, lat2, lng2) => {
  lat1 *= R;
  lng1 *= R;
  lat2 *= R;
  lng2 *= R;
  return (
    6371 *
    Math.acos(
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1) +
        Math.sin(lat1) * Math.sin(lat2)
    )
  );
};

// const getLocationByGiaApi = async (address) => {
//   const makeUrl = "https://msearch.gsi.go.jp/address-search/AddressSearch";
//   const encodedURI = encodeURI(`${makeUrl}?q=${address}`);
//   console.log("地理院APIにリクエスト送信");
//   const location_array = await axios
//     .get(encodedURI)
//     .then((response) => response.data[0].geometry.coordinates);
//   return { lng: location_array[0], lat: location_array[1] };
// };

const parseXml = (xml) => {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.YDF.Feature[0].Geometry[0].Coordinates[0].split(","));
      }
    });
  });
};

const getLocationByYolp = async (address) => {
  const makeUrl =
    "https://map.yahooapis.jp/geocode/V1/geoCoder?appid=dj00aiZpPTRaTTViSEo1NjdFdSZzPWNvbnN1bWVyc2VjcmV0Jng9ZGM-";
  const encodedURI = encodeURI(`${makeUrl}&query=${address}`);
  // console.log("YOLPにリクエスト送信");
  const location_array = await axios
    .get(encodedURI)
    .then((response) => parseXml(response.data));

  return { lng: location_array[0], lat: location_array[1] };
};

app.post("/api/mapping", async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    res.status(200);
    return;
  }
  const startTime = performance.now(); // 開始時間

  const url = req.body.url;
  const centerAddress = req.body.centerAddress;
  const distance_string = req.body.distance;

  const centerLocation = await getLocationByYolp(centerAddress);
  const distance = Number(distance_string);

  const options = {
    headless: true,
  };
  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  await page.goto(url);
  await sleep(3000);

  const getTextContentFromElemHandler = async (elementHandle) => {
    const textContentProperty = await elementHandle.getProperty("textContent");
    return textContentProperty.jsonValue();
  };

  const getHrefFromElemHandler = async (elementHandle) => {
    const hrefProperty = await elementHandle.getProperty("href");
    return hrefProperty.jsonValue();
  };

  const getSrcFromElemHandler = async (elementHandle) => {
    const srcProperty = await elementHandle.getProperty("src");
    return srcProperty.jsonValue();
  };

  const map = new Map();
  const extractInfoFromSinglePage = async (page) => {
    const elems = await page.$$("ul.l-cassetteitem > li");

    const propertyInfosWithNull = await Promise.all(
      elems.map(async (elem) => {
        // TODO: 複数の部屋の表示に対応する
        const trs = await elem.$$(".cassetteitem_other > tbody > tr");
        const tds = await trs[0].$$("td");

        // 階数
        const stairs = await getTextContentFromElemHandler(tds[2]);

        // 詳細リンク
        const detailUrlElemHandler = await tds[tds.length - 1].$("a");
        const detailUrl = await getHrefFromElemHandler(detailUrlElemHandler);

        // 画像URL
        let imgSrc = "";
        try {
          const imgElemHandler = await elem.$(".js-linkImage");
          imgSrc = await getSrcFromElemHandler(imgElemHandler);
        } catch (error) {
          imgSrc = "";
        }

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
        const gratuityElemHandler = await elem.$(
          ".cassetteitem_price--gratuity"
        );
        const gratuity = await getTextContentFromElemHandler(
          gratuityElemHandler
        );

        // 間取り
        const planOfHouseElemHandler = await elem.$(".cassetteitem_madori");
        const planOfHouse = await getTextContentFromElemHandler(
          planOfHouseElemHandler
        );

        // 面積
        const areaElemHandler = await elem.$(".cassetteitem_menseki");
        const area = await getTextContentFromElemHandler(areaElemHandler);

        let location = {};
        const found_location = map.get(address); // なければundefinedが返ってくる
        if (found_location) {
          location = found_location;
        } else {
          // 座標
          location = await getLocationByYolp(address);
          // console.log(address, location);
          map.set(address, location);
        }

        if (
          calcDistance(
            centerLocation.lat,
            centerLocation.lng,
            location.lat,
            location.lng
          ) *
            1000 <
          distance
        ) {
          return {
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
          };
        } else return null;
      })
    );
    const propertyInfos = propertyInfosWithNull.filter((item) => item);

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
  let currentPageNum = 1;
  while (true) {
    // 現在のページから物件情報を抽出する
    console.log(`${currentPageNum}ページ: 物件情報を抽出する`);
    const [propertyInfosPerPage, nextElemHandler] =
      await extractInfoFromSinglePage(page);
    propertyInfos = [...propertyInfos, ...propertyInfosPerPage];
    if (nextElemHandler) {
      console.log("次へをクリック");
      await sleep(1000);
      nextElemHandler.click();
      currentPageNum += 1;
      // https://qiita.com/monaka_ben_mezd/items/4cb6191458b2d7af0cf7
      // await page.waitForNavigation({ waitUntil: ["load", "networkidle2"] });
      await sleep(8000);
    } else break;
  }

  const endTime = performance.now(); // 終了時間
  console.log((endTime - startTime) / 1000, " [s]"); // 何ミリ秒かかったかを表示する

  await browser.close();

  res.status(200).send({
    data: propertyInfos,
  });
});
