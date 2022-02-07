import React, { useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { LatLng } from "leaflet";
import "leaflet/dist/leaflet.css"; //  Leaflet デフォルトのスタイルを指定しているもので、これがないと表示が崩れる

import "./App.css";

// https://www.webdevqa.jp.net/ja/javascript/reactleaflet%E3%83%9E%E3%83%BC%E3%82%AB%E3%83%BC%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB%E3%81%8C%E8%A6%8B%E3%81%A4%E3%81%8B%E3%82%8A%E3%81%BE%E3%81%9B%E3%82%93/837230444/
// react-leafletにマーカーのアイコン画像が含まれていないため、
// デフォルトのアイコン画像をリセットする
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
});
L.Marker.prototype.options.icon = DefaultIcon;

type Location = { lat: number; lng: number };

type RentalInfo = {
  stairs: string;
  detailUrl: string;
  imgSrc: string;
  title: string;
  address: string;
  location: Location;
  rent: string;
  administrativeExpenses: string;
  deposit: string;
  gratuity: string;
  planOfHouse: string;
  area: string;
};

const checkValidURL = (str: string) => {
  const regex =
    /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/;
  return regex.test(str);
};

const getRandomFloat = (max: number = 1) => {
  return Math.random() * max;
};

function App() {
  const [url, setUrl] = useState("");
  const [centerAddress, setCenterAddress] = useState("東京都八王子市館町815-1");
  const [distance, setDistance] = useState("2000");
  const [rentalInfos, setRentalInfos] = useState<RentalInfo[]>([]);
  const [showLoading, setShowLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [position, setPosition] = useState<LatLng>(new LatLng(35.68, 139.76)); // 初期表示する緯度と経度を指定
  const [progress, setProgress] = useState<number>(0);
  // const [clientIo, setClientIo] = useState<any>(null);

  const sendUrl = async () => {
    if (!url || !checkValidURL(url)) return;
    if (isNaN(Number(distance))) return;
    setShowLoading(true);
    const socket = io("http://localhost:3001");
    // 進捗状況を受け取る
    socket.on("progress", (progress) => {
      console.log(`${progress} ％`);
      setProgress(progress);
    });
    socket.on("connect", async () => {
      const rentalInfos = await axios
        .post(`http://localhost:3001/api/mapping`, {
          url,
          centerAddress,
          distance,
          socketId: socket.id,
        })
        .then((res) => res.data.data);
      // 各locationのjson配列を作成する
      const locations_json: string[] = rentalInfos.map((r: RentalInfo) =>
        JSON.stringify(r.location)
      );
      // locationのjson配列から重複するものを抽出する
      const duplicatedlocations_json = Array.from(
        new Set(
          rentalInfos
            .filter(
              (rentalInfo: RentalInfo, i: number) =>
                locations_json.indexOf(JSON.stringify(rentalInfo.location)) !==
                locations_json.lastIndexOf(JSON.stringify(rentalInfo.location))
            )
            .map((rentalInfo: RentalInfo) =>
              JSON.stringify(rentalInfo.location)
            )
        )
      );
      const duplicateRentalInfoslocationAvoided = rentalInfos.map(
        (rentalInfo: RentalInfo) => {
          const location = rentalInfo.location;
          let newlocation = {};
          if (duplicatedlocations_json.includes(JSON.stringify(location))) {
            // 座標が完全に一致しているので微妙にずらす
            newlocation = {
              lat: location.lat + getRandomFloat(0.002),
              lng: location.lng + getRandomFloat(0.002),
            };
          } else {
            newlocation = location;
          }
          return {
            ...rentalInfo,
            location: newlocation,
          };
        }
      );
      setRentalInfos(duplicateRentalInfoslocationAvoided);
      setShowLoading(false);
      setShowMap((oldState) => !oldState);
      socket.disconnect();
    });
  };

  // useEffect(() => {
  //   const socket = io("http://localhost:3001");
  //   socket.on("progress", (progress) => {
  //     console.log("Recieved: " + progress);
  //     setProgress(progress);
  //   });
  //   socket.on("connect", () => {
  //     console.log(socket.id);
  //   });
  // }, []);

  useEffect(() => {
    if (rentalInfos.length === 0) return;
    const location = rentalInfos[0].location;
    setPosition(new LatLng(location.lat, location.lng));
  }, [rentalInfos]);

  return (
    <div className="App">
      {showLoading ? (
        <>
          <div className="flex flex-col justify-center items-center h-full">
            <div className="mb-1 text-lg font-medium dark:text-white .text-center mb-4">
              物件情報をマッピング中...
            </div>
            <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent mb-8"></div>
            <div className="w-full px-[5%]">
              <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                <div
                  className="bg-blue-600 h-4 rounded-full"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        </>
      ) : showMap ? (
        <>
          {/* center は最初に表示される中心の座標で、zoom はズームレベル（標準的には1～18程度） */}
          {/* MapContainer コンポーネントとして Leaflet の地図が表示される */}
          {/* 地図に対してマーカー等を追加する場合は、この子コンポーネントとして様々な要素を指定していく */}
          <MapContainer center={position} zoom={13}>
            {/* TileLayer として OpenStreetMap の地図タイルを表示している */}
            <TileLayer
              attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
              url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
            />
            {rentalInfos.map((rentalInfo, index) => (
              <Marker
                position={
                  new LatLng(rentalInfo.location.lat, rentalInfo.location.lng)
                }
                key={index}
              >
                <Popup>
                  <img
                    src={rentalInfo.imgSrc}
                    className="inline"
                    alt="物件画像"
                  />
                  <br />
                  <span>物件名: {rentalInfo.title}</span>
                  <br />
                  <span>住所: {rentalInfo.address}</span>
                  <br />
                  <span>賃料: {rentalInfo.rent}</span>
                  <br />
                  <span>管理費: {rentalInfo.administrativeExpenses}</span>
                  <br />
                  <span>敷金: {rentalInfo.deposit}</span>
                  <br />
                  <span>礼金: {rentalInfo.gratuity}</span>
                  <br />
                  <span>間取り: {rentalInfo.planOfHouse}</span>
                  <br />
                  <span>専有面積: {rentalInfo.area}</span>
                  <br />
                  <span>階数: {rentalInfo.stairs}</span>
                  <br />
                  <a
                    href={rentalInfo.detailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    詳細
                  </a>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </>
      ) : (
        <div className="bg-[url('../public/bg.jpg')] bg-cover bg-center h-full flex justify-center">
          <div className="my-auto w-2/3">
            <div className="flex flex-col">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="URL"
                className="w-full bg-gray-50 text-gray-800 border ring-indigo-300 rounded outline-none transition duration-100 px-3 py-2 mr-5 h-10 mb-5"
              />
              <div className="flex">
                <input
                  type="text"
                  value={centerAddress}
                  onChange={(e) => setCenterAddress(e.target.value)}
                  placeholder="中心地点"
                  className="w-full bg-gray-50 text-gray-800 border ring-indigo-300 rounded outline-none transition duration-100 px-3 py-2 mr-5 h-10 mb-5"
                />
                <input
                  type="text"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="距離"
                  className="w-full bg-gray-50 text-gray-800 border ring-indigo-300 rounded outline-none transition duration-100 px-3 py-2 mr-5 h-10 mb-5"
                />
              </div>
            </div>
            <button
              onClick={sendUrl}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded h-10"
            >
              マッピングする
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
