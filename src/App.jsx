import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';

export default function App() {
  return (
    // 🛡️ 關鍵防護罩：translate="no" 與 className="notranslate"
    // 這會徹底阻擋 Google 翻譯或瀏覽器內建翻譯去破壞畫布！
    <div 
      translate="no" 
      className="notranslate" 
      style={{ position: 'fixed', inset: 0 }}
    >
      <Tldraw />
    </div>
  );
}