import { useEffect } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';

export default function App() {
  // 用來在主控台打卡，看看元件有沒有被 React 偷偷拔掉
  useEffect(() => {
    console.log("🟢 畫布元件已掛載上線！");
    return () => {
      console.log("🔴 警告：畫布元件被系統強制卸載了！");
    };
  }, []);

  return (
    // 我們強制給外框塞滿螢幕，並設定為「大紅色」
    <div style={{ width: '100vw', height: '100vh', backgroundColor: 'red' }}>
      <Tldraw />
    </div>
  );
}