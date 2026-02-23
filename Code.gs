function doPost(e) {
  try {
    // 1. JSONデータをパース
    let jsonString = '';
    let data = {};
    
    try {
      jsonString = e.postData.contents;
      data = JSON.parse(jsonString);
    } catch (parseError) {
      return createResponse(400, "Invalid JSON format: " + parseError.toString());
    }
    
    // 2. プロパティ取得
    const props = PropertiesService.getScriptProperties();
    const WP_SITE_URL = props.getProperty('WP_SITE_URL');
    const WP_USER     = props.getProperty('WP_USER');
    const WP_APP_PASS = props.getProperty('WP_APP_PASS');
    const POST_TYPE   = props.getProperty('POST_TYPE') || 'posts';

    const authHeader = 'Basic ' + Utilities.base64Encode(WP_USER + ':' + WP_APP_PASS);

    // 3. アクション分岐
    if (data.action === 'search') {
      return handleBatchSearch(data, WP_SITE_URL, authHeader, POST_TYPE);
      
    } else if (data.action === 'post') { 
      return handlePost(data, WP_SITE_URL, authHeader, POST_TYPE);
      
    } else if (data.action === 'upload_media') { 
      return handleMediaUploadOnly(data, WP_SITE_URL, authHeader);
      
    } else if (data.action === 'delete') {
      return handleDelete(data, WP_SITE_URL, authHeader, POST_TYPE);
      
    } else if (data.action === 'create_doc' || (!data.action && data.title)) {
      return handleCreateDoc(data);
      
    } else if (data.action === 'save_history') {
      return handleSaveHistory(data);
      
    } else if (data.action === 'get_history') {
      return handleGetHistory(data);
      
    } else if (data.action === 'update_history') {
      return handleUpdateHistory(data);
      
    } else if (data.action === 'delete_history') {
      return handleDeleteHistory(data);
      
    } else if (data.action === 'read_logs') {
      return createResponse(200, "Logs logic not implemented yet");
    } else {
      return createResponse(400, "Invalid Action");
    }
  } catch (globalError) {
    return createResponse(500, "Global doPost Error: " + globalError.toString() + "\nStack: " + globalError.stack);
  }
}

// ==========================================
// A. 一括検索機能 (Map対応版: 表記ゆれ吸収 & 原語紐付け)
// ==========================================
function handleBatchSearch(data, siteUrl, auth, postType) {
  // Map形式を受け取る想定: { "スマホ": ["スマホ", "スマートフォン"], "UX": ["UX"] }
  let keywordsMap = data.keywords || {};
  
  // ★追加：Difyから「単なる文字列（String）」として送られてきた場合、パースしてオブジェクトに戻す
  if (typeof keywordsMap === 'string') {
    try {
      // LLMが余計に付けたマークダウンやテキストを取り除く（最初に見つかった { または [ から、最後に見つかった } または ] までを抽出）
      const match = keywordsMap.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (match) {
        keywordsMap = JSON.parse(match[0]);
      } else {
        throw new Error("JSONの括弧が見つかりません。");
      }
    } catch (e) {
      return createResponse(400, `JSONパースエラー: 文字列を変換できませんでした。受信データ: ${keywordsMap}`, null);
    }
  }

  // もし配列で来ちゃったら、Mapに変換してあげる（優しさ設計）
  if (Array.isArray(keywordsMap)) {
    let tempMap = {};
    keywordsMap.forEach(k => tempMap[k] = [k]);
    keywordsMap = tempMap;
  }

  const terms = Object.keys(keywordsMap);
  if (terms.length === 0) {
    return createResponse(400, "キーワードがありません");
  }

  let foundList = []; // 結果リスト

  // 1. 各「元の単語」ごとにループ
  terms.forEach(originalTerm => {
    let candidates = keywordsMap[originalTerm];
    if (!Array.isArray(candidates)) candidates = [candidates];

    let foundUrl = null;

    // 2. 候補（シノニム）を順番に検索
    // ※ ループ内で return して脱出するために for...of を使用
    for (const searchWord of candidates) {
      if (!searchWord) continue;

      try {
        // 検索実行 (10件取得)
        const endpoint = `${siteUrl}/wp-json/wp/v2/${postType}?search=${encodeURIComponent(searchWord)}&per_page=10&_fields=title,link,slug`;
        const options = {
            'method' : 'get',
            'headers': { 
                'Authorization': auth,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            'muteHttpExceptions': true
        };

        const response = UrlFetchApp.fetch(endpoint, options);
        if (response.getResponseCode() === 200) {
          const results = JSON.parse(response.getContentText());
          
          if (results.length > 0) {
             // 正規化
             const normalize = (str) => str.toString().toLowerCase().trim().replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
             const targetCheck = normalize(searchWord);

             // 一致チェック（完全一致、またはタイトル/スラッグに検索語が含まれるか）
             const match = results.find(article => {
                const t = normalize(article.title.rendered || article.title.raw);
                const s = normalize(article.slug);
                return t === targetCheck || s === targetCheck || t.includes(targetCheck) || s.includes(targetCheck);
             });

             if (match) {
               foundUrl = match.link;
               break; // ★ヒットしたら、この単語(originalTerm)の検索は終了！次へ！
             }
          }
        }
      } catch (e) {
        console.log(`Error: ${e.toString()}`);
      }
      Utilities.sleep(50); // API制限除け
    }

    // 3. ヒットしていれば結果に追加
    if (foundUrl) {
      foundList.push({
        term: originalTerm, // 記事中の元の単語
        url: foundUrl
      });
    }
  });

  // 結果テキスト作成: "元の単語: URL"
  const resultText = foundList.map(item => `${item.term}: ${item.url}`).join('\n');

  return createResponse(200, "Batch Search Success", {
    input_count: terms.length,
    found_count: foundList.length,
    result_text: resultText,
    result_list: foundList 
  });
}

// ==========================================
// C. 記事投稿機能 (Markdown変換対応版)
// ==========================================
function handlePost(data, siteUrl, auth, postType) {
  log("Action: handlePost started.");

  if (!data.title || !data.content) {
    log("Error: Missing title or content");
    return createResponse(400, "Missing title or content");
  }

  // 画像・アイキャッチ処理
  let featuredMediaId = 0;
  if (data.imageUrl) {
    log(`[handlePost] Processing imageUrl: ${data.imageUrl}`);
    let fileName = data.fileName || 'image.jpg';
    // 既存の uploadImageToWordPress を使用
    try {
      // caption も渡せるように修正（もしあれば）
      const uploadResult = uploadImageToWordPress(data.imageUrl, fileName, siteUrl, auth, data.title);
      if (typeof uploadResult === 'number') {
        featuredMediaId = uploadResult;
      } else if (uploadResult && uploadResult.id) {
        featuredMediaId = uploadResult.id;
      }
      log(`[handlePost] Media Upload Result ID: ${featuredMediaId}`);
    } catch (err) {
      log(`[handlePost] Image Upload Error: ${err.toString()}`);
    }
  }

  // Markdown -> HTML 変換 (既存の関数を使用)
  const htmlContent = convertMarkdownToHtml(data.content);

  const payload = {
    title: data.title,
    content: htmlContent,
    status: 'draft',
    slug: data.slug || '',
    excerpt: data.excerpt || '',
    featured_media: featuredMediaId
  };

  // カテゴリIDのパース (極めて堅牢に)
  if (data.categoryIds) {
    log(`[handlePost] raw categoryIds input: ${JSON.stringify(data.categoryIds)}`);
    
    let allIds = [];
    // どんな形式(Array, String)で来ても配列にして処理
    let initialList = Array.isArray(data.categoryIds) ? data.categoryIds : [data.categoryIds];

    initialList.forEach(item => {
      if (!item) return;

      if (typeof item === 'number') {
        allIds.push(item);
      } else if (typeof item === 'string') {
        // "369, 370" や "[369]" などの形式を数字の配列に変換
        const matches = item.match(/\d+/g);
        if (matches) {
          matches.forEach(m => allIds.push(parseInt(m, 10)));
        }
      } else if (Array.isArray(item)) {
        // 入れ子（[[369]]）対策
        item.forEach(subItem => {
          const val = parseInt(subItem, 10);
          if (!isNaN(val)) allIds.push(val);
        });
      }
    });

    // 重複排除と数値チェック
    payload.categories = allIds.filter((v, i, a) => a.indexOf(v) === i && !isNaN(v));
    log(`[handlePost] Final parsed categories for WP: ${JSON.stringify(payload.categories)}`);
  }

  const endpoint = `${siteUrl}/wp-json/wp/v2/${postType}`;
  
  // ... (以下、送信処理はそのまま) ...
  const options = {
    'method': 'post',
    'headers': {
      'Authorization': auth,
      'Content-Type': 'application/json'
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  try {
    log(`WP POST Endpoint: ${endpoint}`);
    log(`WP POST Payload: ${JSON.stringify(payload)}`);
    const response = UrlFetchApp.fetch(endpoint, options);
    const rawResponse = response.getContentText();
    log(`WP POST Response Code: ${response.getResponseCode()}, Body: ${rawResponse}`);
    
    // Only parse if it looks like JSON
    let result = {};
    if (rawResponse && rawResponse.startsWith('{')) {
       result = JSON.parse(rawResponse);
    } else {
       throw new Error(`WordPress returned non-JSON response: ${rawResponse}`);
    }
    
    // ★追加（修正版）: siteUrlをそのまま使って管理画面URLを組み立てる (サブディレクトリ対応)
    if (result && result.id) {
      // WordPressの編集画面URL（クラシックエディタ指定）
      // 例: https://uxdaystokyo.com/articles/wp-admin/post.php?post=37795&action=edit&classic-editor__forget&classic-editor
      result.editUrl = `${siteUrl}/wp-admin/post.php?post=${result.id}&action=edit&classic-editor__forget&classic-editor`;

      // ★バックグラウンド更新: taskIdがあればスプレッドシート履歴を「完了」にする
      if (data.taskId) {
        log(`Updating history for taskId: ${data.taskId}`);
        try {
          handleUpdateHistory({
            id: data.taskId,
            updates: {
              status: "completed",
              progress: 100,
              wpLink: result.editUrl,
              difyResponse: data.content
            }
          });
        } catch (updateErr) {
          log(`Failed to update history: ${updateErr}`);
        }
      }
    }
    // ★ここで古いファイルを自動削除（1ヶ月以上前）
    deleteOldFilesInFolder();

    return createResponse(200, "Post Created", result);
  } catch (e) {
    return createResponse(500, "Error: " + e.toString());
  }

}

// ==========================================
// E. 削除機能 (WordPress記事 & Google Driveドキュメント連携削除)
// ==========================================
function handleDelete(data, siteUrl, auth, postType) {
  let wpDeleted = false;
  let docDeleted = false;
  let errors = [];

  // 1. WordPress記事の削除 (wpLink から Post ID を抽出)
  if (data.wpLink) {
    try {
      // URLからのPost ID抽出 (例: .../wp-admin/post.php?post=37795&action=edit...)
      const match = data.wpLink.match(/[?&]post=(\d+)/);
      const postId = match ? match[1] : null;

      if (postId) {
        // WordPress REST API GET (to check status first)
        const getEndpoint = `${siteUrl}/wp-json/wp/v2/${postType}/${postId}?_fields=status`;
        const getOptions = {
          'method': 'get',
          'headers': {
            'Authorization': auth,
          },
          'muteHttpExceptions': true
        };
        const getResponse = UrlFetchApp.fetch(getEndpoint, getOptions);
        
        if (getResponse.getResponseCode() === 200) {
           const postData = JSON.parse(getResponse.getContentText());
           if (postData.status === 'publish' || postData.status !== 'draft') {
              errors.push(`WordPress post is not a draft (status: ${postData.status}). Did not delete.`);
           } else {
             // It's a draft, proceed with deletion (soft delete / trash)
             const deleteEndpoint = `${siteUrl}/wp-json/wp/v2/${postType}/${postId}`;
             const deleteOptions = {
               'method': 'delete',
               'headers': {
                 'Authorization': auth,
               },
               'muteHttpExceptions': true
             };
             const deleteResponse = UrlFetchApp.fetch(deleteEndpoint, deleteOptions);
             if (deleteResponse.getResponseCode() === 200 || deleteResponse.getResponseCode() === 201) {
                wpDeleted = true;
             } else {
                errors.push(`WordPress Delete Failed: ${deleteResponse.getContentText()}`);
             }
           }
        } else {
           // Not found or error
           errors.push(`WordPress Get Failed or Post Not Found: ${getResponse.getContentText()}`);
        }
      }
    } catch (e) {
       errors.push("WordPress Delete Error: " + e.toString());
    }
  }

  // 2. Google Docsの削除 (docUrl がフロントから渡された場合)
  // フロントからは単一のURL文字列、またはURLの配列が渡される可能性がある
  if (data.docUrl) {
    const docUrls = Array.isArray(data.docUrl) ? data.docUrl : [data.docUrl];
    
    for (const url of docUrls) {
      try {
        let docId = null;
        // より汎用的なID抽出: /d/XXX/ または /d/XXX (末尾スラなし対応)
        const docMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (docMatch) {
           docId = docMatch[1];
        } else {
           const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
           if (idMatch) docId = idMatch[1];
        }
        
        if (docId) {
          DriveApp.getFileById(docId).setTrashed(true);
          docDeleted = true;
          log(`Doc Deleted: ${docId}`);
        }
      } catch (e) {
          log(`Google Docs Delete Error for ${url}: ${e.toString()}`);
          errors.push(`Google Docs Delete Error (${url}): ${e.toString()}`);
      }
    }
  }

  return createResponse(200, "Delete Attempted", { wpDeleted, docDeleted, errors });
}

// ==========================================
// ヘルパー関数群
// ==========================================

function convertMarkdownToHtml(markdown) {
  if (!markdown) return "";
  
  // ★追加：Difyが生成途中でぶった切った不正な画像タグ等を無害化する
  // 例: <img src="<br" /> となってしまったものを安全な形式に置換または削除
  let safeMarkdown = markdown.replace(/<img[^>]*?<br[^>]*>/gi, ''); // 途中で<br>が混じった崩壊タグを削除
  safeMarkdown = safeMarkdown.replace(/<img[^>]*$/i, ''); // 閉じられていない <img> タグが末尾にあれば削除
  
  const lines = safeMarkdown.split('\n');
  let html = '';
  let inList = false;

  lines.forEach(line => {
    // リスト処理
    const listMatch = line.match(/^-\s+(.*)/);
    if (listMatch) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += `  <li>${listMatch[1]}</li>\n`;
    } else {
      if (inList) { html += '</ul>\n'; inList = false; }
      let l = line;
      // 見出し処理
      if (l.match(/^### (.*)/)) l = l.replace(/^### (.*)/, '<h3>$1</h3>');
      else if (l.match(/^## (.*)/)) l = l.replace(/^## (.*)/, '<h2>$1</h2>');
      else if (l.match(/^# (.*)/)) l = l.replace(/^# (.*)/, '<h1>$1</h1>');
      else if (l.trim() !== '') l += '<br>'; // 改行
      
      html += l + '\n';
    }
  });
  if (inList) html += '</ul>\n';

  // 太字変換
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // リンク変換
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

  // ★★★ 修正箇所: ルビ変換 (英単語¥ヨミ¥ 形式) ★★★
  // 直前の英数字の塊をターゲットにしてルビを振ります
  // 例: "Multimodal¥マルチモーダル¥" → <ruby>Multimodal<rt>マルチモーダル</rt></ruby>
  html = html.replace(/([a-zA-Z0-9]+)¥(.*?)¥/g, '<ruby>$1<rt>$2</rt></ruby>');

  return html;
}

function createResponse(code, message, data) {
  const output = { statusCode: code, message: message, data: data || null };
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// C. テスト実行用 (修正版)
// ==========================================
function testBatchSearch() {
  const mockData = {
    keywords: ["UX", "NPS", "マルチモーダル", "存在しない用語テスト"] 
  };

  const props = PropertiesService.getScriptProperties();
  const WP_SITE_URL = props.getProperty('WP_SITE_URL');
  const WP_USER     = props.getProperty('WP_USER');
  const WP_APP_PASS = props.getProperty('WP_APP_PASS');
  const POST_TYPE   = props.getProperty('POST_TYPE') || 'glossary';

  if (!WP_SITE_URL || !WP_USER || !WP_APP_PASS) {
    console.error("エラー: スクリプトプロパティが設定されていません。");
    return;
  }

  const authHeader = 'Basic ' + Utilities.base64Encode(WP_USER + ':' + WP_APP_PASS);

  console.log("=== テスト検索を開始します ===");
  console.log("検索ワード:", mockData.keywords);

  const response = handleBatchSearch(mockData, WP_SITE_URL, authHeader, POST_TYPE);

  // ★ここを修正しました (getContentText -> getContent)
  const jsonString = response.getContent(); 
  const result = JSON.parse(jsonString);

  console.log("=== 実行結果 ===");
  console.log("ステータスコード:", result.statusCode);
  console.log("メッセージ:", result.message);
  
  if (result.data) {
    console.log("ヒット数:", result.data.found_count);
    console.log("--- result_text ---");
    console.log(result.data.result_text);
    console.log("-------------------");
    console.log("詳細データ:", JSON.stringify(result.data.result_list, null, 2));
  } else {
    console.log("データがありません。");
  }
}

/**
 * 画像をWordPressにアップロードし、キャプションと代替テキストを設定する
 * @param {string} imageUrl 画像のURL
 * @param {string} fileName ファイル名
 * @param {string} siteUrl WordPressサイトのURL
 * @param {string} auth 認証ヘッダー
 * @param {string} caption キャプション・代替テキスト（新規追加）
 */


// ==========================================
// 0. グローバル変数 & ログ収集用関数
// ==========================================
var debugLogs = []; // ログを貯める配列

function log(message) {
  console.log(message);      // GASコンソール用
  debugLogs.push(message);   // 返却レスポンス用
}

// ==========================================
// 共通レスポンス作成 (ログ出力対応版)
// ==========================================
function createResponse(statusCode, message, data) {
  const output = {
    statusCode: statusCode,
    message: message,
    data: data || null,
    debug_log: debugLogs // ★ここに実行ログが全て入ります
  };
  
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// D. 画像アップロード機能 (完全版・URL返却対応)
// ==========================================
function uploadImageToWordPress(imageUrl, fileName, siteUrl, auth, caption) {
  if (!imageUrl) {
    log("Error: imageUrl is empty");
    return null;
  }

  log(`[Start] Upload Image process.`);
  log(`Target URL: ${imageUrl}`);
  log(`File Name: ${fileName}`);
  if (caption) log(`Caption: ${caption}`);

  try {
    // 1. 画像データをWebからダウンロード
    const downloadOptions = {
      'muteHttpExceptions': true,
      'headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    
    log("Fetching image from web...");
    const imageResponse = UrlFetchApp.fetch(imageUrl, downloadOptions);
    const responseCode = imageResponse.getResponseCode();
    log(`Image Fetch Response Code: ${responseCode}`);

    if (responseCode !== 200) {
      log(`Failed to fetch image. Status: ${responseCode}`);
      return null;
    }
    
    const blob = imageResponse.getBlob().setName(fileName);
    
    // 2. WordPressへアップロード
    const endpoint = `${siteUrl}/wp-json/wp/v2/media`;
    const uploadOptions = {
      'method': 'post',
      'headers': {
        'Authorization': auth,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
      'contentType': blob.getContentType(),
      'payload': blob,
      'muteHttpExceptions': true
    };

    const uploadResponse = UrlFetchApp.fetch(endpoint, uploadOptions);
    const uploadCode = uploadResponse.getResponseCode();
    const resultText = uploadResponse.getContentText();
    
    log(`WordPress Upload Response Code: ${uploadCode}`);

    if (uploadCode === 201) {
      const result = JSON.parse(resultText);
      const mediaId = result.id;
      log(`Upload Success! Media ID: ${mediaId}`);
      
      // 3. キャプション設定
      if (caption) {
        log("Updating media caption/alt text...");
        const updateEndpoint = `${endpoint}/${mediaId}`;
        const updateOptions = {
          'method': 'post',
          'headers': {
            'Authorization': auth,
            'Content-Type': 'application/json'
          },
          'payload': JSON.stringify({
            'caption': caption,
            'alt_text': caption,
            'description': caption,
            'title': caption
          }),
          'muteHttpExceptions': true
        };
        UrlFetchApp.fetch(updateEndpoint, updateOptions);
      }

      // IDとURLの両方を返す（互換性のため）
      return {
        id: mediaId,
        url: result.source_url
      };
      
    } else {
      log(`WordPress Upload Failed: ${resultText}`);
      return null;
    }
  } catch (e) {
    log(`Exception in uploadImageToWordPress: ${e.toString()}`);
    return null;
  }
}

// ==========================================
// F. 画像単体アップロード機能 (Difyイテレーション対応版) 修正版
// ==========================================
function handleMediaUploadOnly(data, siteUrl, auth) {
  log("Action: handleMediaUploadOnly started.");
  
  // 1. URLがあるかチェック
  if (!data.imageUrl) {
    log("Error: No imageUrl provided in JSON data.");
    return createResponse(400, "Error: imageUrl is missing");
  }

  // 2. キャプションの取得（Difyから送られてきたもの）
  const caption = data.caption || "";
  log(`Received caption: ${caption}`);

  // 3. ファイル名の自動生成
  let fileName = data.fileName;
  if (!fileName) {
    const extMatch = data.imageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i);
    const ext = extMatch ? extMatch[0] : '.jpg';
    fileName = 'wp-upload-' + new Date().getTime() + ext;
  }
  // 4. 画像アップロード & キャプション設定実行
  const result = uploadImageToWordPress(data.imageUrl, fileName, siteUrl, auth, caption);
  
  if (result && result.id) {
    log("Upload process completed successfully.");
    return createResponse(200, "success", result);
  } else {
    log("Upload process failed.");
    return createResponse(500, "Upload failed");
  }
}

// ==========================================
// G. Google Driveの古いファイル自動削除機能
// ==========================================
function deleteOldFilesInFolder() {
  // スクリプトプロパティ「TARGET_DRIVE_FOLDER_ID」にフォルダIDを設定してください
  const folderId = PropertiesService.getScriptProperties().getProperty('TARGET_DRIVE_FOLDER_ID');
  
  if (!folderId) {
    log('エラー: TARGET_DRIVE_FOLDER_IDが設定されていません');
    return;
  }
  
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    
    // 1ヶ月前（30日前）の日付を計算
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 30);
    
    let deletedCount = 0;
    
    // フォルダ内のファイルを順番に確認
    while (files.hasNext()) {
      const file = files.next();
      const lastUpdated = file.getLastUpdated();
      
      // 最終更新日が1ヶ月以上前の場合、ゴミ箱に移動
      if (lastUpdated < thresholdDate) {
        file.setTrashed(true); // ゴミ箱へ移動
        log(`削除完了: ${file.getName()} (更新日: ${lastUpdated})`);
        deletedCount++;
      }
    }
    
    log(`処理完了: 合計 ${deletedCount} 件のファイルをゴミ箱に移動しました。`);
    
  } catch (e) {
    log('エラーが発生しました: ' + e.message);
  }
}

// ==========================================
// F. Google Docs 作成機能 (Dify連携)
// ==========================================
const DESTINATION_FOLDER_ID = '1tQU3-ts3mU6YusLFjijNDNGzdcf-y-GS';

function handleCreateDoc(data) {
  try {
    log('POSTリクエスト(create_doc)を受信しました');
    const title = data.title || 'Untitled Document';
    
    // 1. 新しいGoogle Docsを作成
    const doc = DocumentApp.create(title);
    const docId = doc.getId();

    // 2. 指定した固定フォルダへ移動する処理
    try {
      const file = DriveApp.getFileById(docId); // DriveAppでファイルとして操作
      const folder = DriveApp.getFolderById(DESTINATION_FOLDER_ID); // 移動先フォルダ
      file.moveTo(folder); // 移動実行
      log('固定フォルダへ移動しました: ' + DESTINATION_FOLDER_ID);
    } catch (folderError) {
      log('フォルダ移動に失敗しました（ルートに残ります）: ' + folderError.toString());
    }
    
    // 3. ドキュメントの本文編集
    const body = doc.getBody();
    body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('作成日時: ' + new Date().toLocaleString()).setHeading(DocumentApp.ParagraphHeading.NORMAL);
    
    if (data.content) {
      body.appendParagraph(data.content).setHeading(DocumentApp.ParagraphHeading.NORMAL);
    }
    
    doc.saveAndClose();
    const docUrl = doc.getUrl();
    log('ドキュメント作成完了 - URL: ' + docUrl);
    
    // Difyがパースできるよう、既存のレスポンス形式を維持する（createResponseを使わない）
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'ドキュメントが作成されました',
      documentUrl: docUrl,
      title: title
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    log('エラーが発生しました: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// DB: スプレッドシート履歴管理
// ==========================================
// 履歴保存用シートID
const HISTORY_SHEET_ID = '13Au8w9webxS6PxNEBKOsEJ40PvsDCCG5L5MDxAPliqI';

function initSpreadsheet() {
  const ss = SpreadsheetApp.openById(HISTORY_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const headers = ['id', 'term', 'email', 'createdAt', 'status', 'difyResponse', 'wpLink', 'progress', 'difficulty', 'literacy', 'context'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  // デザイン調整
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f4f6');
  sheet.setFrozenRows(1);
}

function handleGetHistory(data) {
  try {
    const ss = SpreadsheetApp.openById(HISTORY_SHEET_ID);
    const sheet = ss.getSheets()[0];
    
    // 全データ取得 (ヘッダー除く)
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return createResponse(200, "success", { history: [] });
    }
    
    // ヘッダー以外のデータ行を取得 (11列分)
    const rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    const history = [];
    
    for (const row of rows) {
      // row: [id, term, email, createdAt, status, difyResponse, wpLink, progress, difficulty, literacy, context]
      history.push({
        id: row[0],
        topic: row[1],
        mail: row[2],
        createdAt: row[3],
        status: row[4],
        difyResponse: row[5],
        wpLink: row[6],
        progress: row[7],
        difficulty: row[8],
        literacy: row[9],
        context: row[10]
      });
    }
    
    // 新しい順に並び替え
    history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return createResponse(200, "success", { history: history });
  } catch (error) {
    return createResponse(500, error.toString());
  }
}

function handleSaveHistory(data) {
  try {
    const ss = SpreadsheetApp.openById(HISTORY_SHEET_ID);
    const sheet = ss.getSheets()[0];
    const { id, topic, mail, createdAt, status, difyResponse, wpLink, progress, difficulty, literacy, context } = data.historyItem;
    
    // 末尾に追加
    sheet.appendRow([
      id || '', 
      topic || '', 
      mail || '', 
      createdAt || '', 
      status || '', 
      difyResponse || '', 
      wpLink || '', 
      progress || 0,
      difficulty || 0.5,
      literacy || 0.5,
      context || ''
    ]);
    
    return createResponse(200, "success");
  } catch (error) {
    return createResponse(500, error.toString());
  }
}

function handleUpdateHistory(data) {
  try {
    const ss = SpreadsheetApp.openById(HISTORY_SHEET_ID);
    const sheet = ss.getSheets()[0];
    const { id, updates } = data;
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return createResponse(404, "no data");
    
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    const rowIndex = ids.indexOf(id);
    
    if (rowIndex === -1) {
      return createResponse(404, "ID not found");
    }
    
    const actualRow = rowIndex + 2;
    
    // まとめて更新できるように、現在の行のデータを取得
    const range = sheet.getRange(actualRow, 1, 1, 11);
    const rowValues = range.getValues()[0];
    
    // rowData: [id, topic, mail, createdAt, status, difyResponse, wpLink, progress, difficulty, literacy, context]
    if (updates.status !== undefined) rowValues[4] = updates.status;
    if (updates.difyResponse !== undefined) rowValues[5] = updates.difyResponse;
    if (updates.wpLink !== undefined) rowValues[6] = updates.wpLink;
    if (updates.progress !== undefined) rowValues[7] = updates.progress;
    
    // 一括で書き戻し (1回のAPI呼び出しで済ませる)
    range.setValues([rowValues]);
    
    return createResponse(200, "success");
  } catch (error) {
    return createResponse(500, error.toString());
  }
}

function handleDeleteHistory(data) {
  try {
    const ss = SpreadsheetApp.openById(HISTORY_SHEET_ID);
    const sheet = ss.getSheets()[0];
    const id = data.id;
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return createResponse(404, "no data");
    
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    const rowIndex = ids.indexOf(id);
    
    if (rowIndex !== -1) {
      sheet.deleteRow(rowIndex + 2);
    }
    return createResponse(200, "success");
  } catch (error) {
    return createResponse(500, error.toString());
  }
}
