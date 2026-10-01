import { useState, useEffect, useCallback } from 'react';
import { Tldraw, AssetRecordType, createShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.mjs`;

// ==========================================
// 🌟 新增功能 A：獨立的計時器元件
// ==========================================
const CountdownTimer = ({ initialTime, onTimeUp }) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timerId = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerId);
          onTimeUp(); // 時間到，觸發交卷
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerId);
  }, [timeLeft, onTimeUp]);

  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  return (
    <div style={{
      background: timeLeft <= 60 ? '#fadbd8' : '#ecf0f1',
      color: timeLeft <= 60 ? '#c0392b' : '#2c3e50',
      padding: '8px 15px', borderRadius: '8px',
      fontWeight: 'bold', fontSize: '20px', transition: 'all 0.3s ease'
    }}>
      ⏱️ {`${m}:${s.toString().padStart(2, '0')}`}
    </div>
  );
};

// ==========================================
// 主應用程式
// ==========================================
export default function App() {
  const [params, setParams] = useState({ taskId: '', student: '', pdfUrl: '', initialTime: 0 });
  const [editor, setEditor] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  // 🌟 新增功能 B：讀取網址參數
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const taskId = searchParams.get('taskId') || 'test-id';
    const student = searchParams.get('student') || '測試學生';
    const pdfUrl = searchParams.get('pdfUrl') || '/test.pdf'; 
    const timeLimit = parseInt(searchParams.get('time')) || 2; // 預設 2 分鐘測試

    setParams({ taskId, student, pdfUrl, initialTime: timeLimit > 0 ? timeLimit * 60 : 120 });
  }, []);

  const handleMount = useCallback((editorInstance) => {
    setEditor(editorInstance);
  }, []);

  // 🌟 新增功能 C：假交卷邏輯 (先不上傳，純測試穩定度)
  const handleAutoSubmit = useCallback((message) => {
    alert(`${message}\n\n(目前為階段二測試，尚未上傳至 Firebase，請確認畫布是否依然穩定！)`);
  }, []);

  const loadPdfIntoTldraw = async (tldrawEditor, url) => {
    setIsLoadingPdf(true);
    try {
      const loadingTask = pdfjsLib.getDocument({ url: url });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); 
      
      const viewport = page.getViewport({ scale: 2.5 }); 
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const myAssetId = AssetRecordType.createId();
      const myShapeId = createShapeId();

      tldrawEditor.createAssets([{
        id: myAssetId, type: 'image', typeName: 'asset',
        props: { 
          w: canvas.width, h: canvas.height, 
          name: 'exam-paper', isAnimated: false, 
          mimeType: 'image/jpeg', src: dataUrl 
        },
        meta: {}, 
      }]);

      tldrawEditor.createShapes([{
        id: myShapeId, type: 'image', x: 0, y: 0, isLocked: true,
        props: { assetId: myAssetId, w: canvas.width, h: canvas.height }, 
        meta: {}, 
      }]);

      setTimeout(() => tldrawEditor.zoomToFit(), 200);

    } catch (err) {
      console.error("PDF 載入失敗:", err);
    } finally {
      setIsLoadingPdf(false);
    }
  };

  useEffect(() => {
    if (editor && params.pdfUrl) {
      loadPdfIntoTldraw(editor, params.pdfUrl);
    }
  }, [editor, params.pdfUrl]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      
      {/* 🌟 頂部工具列 */}
      {params.initialTime > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '60px',
          background: '#ffffff', borderBottom: '2px solid #ecf0f1',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 20px', fontFamily: 'sans-serif', zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <CountdownTimer 
              initialTime={params.initialTime} 
              onTimeUp={() => handleAutoSubmit("⏰ 時間到！系統已自動收卷。")} 
            />
            <span style={{ color: '#7f8c8d', fontSize: '15px', fontWeight: 'bold' }}>
              🧑‍🎓 {params.student}
            </span>
          </div>
          
          <button 
            onClick={() => handleAutoSubmit("確定要提前交卷嗎？")}
            style={{
              background: '#27ae60', color: 'white', border: 'none',
              padding: '10px 20px', borderRadius: '8px',
              fontWeight: 'bold', fontSize: '16px', cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(39, 174, 96, 0.2)'
            }}
          >
            提前交卷
          </button>
        </div>
      )}

      {/* 畫布本體 (往下挪 60px 讓出頂部空間) */}
      <div style={{ position: 'absolute', top: params.initialTime > 0 ? '60px' : 0, bottom: 0, left: 0, right: 0 }}>
        {isLoadingPdf && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)',
            zIndex: 10, display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: '24px', fontWeight: 'bold', color: '#2c3e50'
          }}>
            🔄 考卷解析與載入中...
          </div>
        )}
        <Tldraw onMount={handleMount} />
      </div>
    </div>
  );
}