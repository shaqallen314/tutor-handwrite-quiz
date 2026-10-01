import { useState, useEffect, useCallback } from 'react';
import { Tldraw, AssetRecordType, createShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.mjs`;

export default function App() {
  const [editor, setEditor] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfUrl] = useState('/test.pdf'); 

  const handleMount = useCallback((editorInstance) => {
    setEditor(editorInstance);
  }, []);

  const loadPdfIntoTldraw = async (tldrawEditor, url) => {
    setIsLoadingPdf(true);
    try {
      const loadingTask = pdfjsLib.getDocument({ url: url });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); 
      
      const viewport = page.getViewport({ scale: 1.5 }); 
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      // 🚀 核心修正：大方用回 Base64 (Data URL)！
      // 既然沒有了新版的惡意自爆機制，這段完美的轉換代碼就能穩定運作
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
    if (editor && pdfUrl) {
      loadPdfIntoTldraw(editor, pdfUrl);
    }
  }, [editor, pdfUrl]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {isLoadingPdf && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)',
          zIndex: 10, display: 'flex', justifyContent: 'center', alignItems: 'center',
          fontSize: '24px', fontWeight: 'bold'
        }}>
          🔄 考卷解析與載入中...
        </div>
      )}
      <Tldraw onMount={handleMount} />
    </div>
  );
}