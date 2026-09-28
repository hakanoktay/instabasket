# InstaBasket

Instagram'da URL'leri sürükleyip bir "sepete" bırakmanı sağlayan Chrome eklentisi.

## Nasıl çalışır

- `instagram.com` üzerindeyken adres çubuğundaki URL'yi (ya da sayfadaki bir gönderi/profil linkini) sürükleyip sayfanın üzerine getir.
- Sağ üst köşede **🧺 Sepete bırak** kutusu açılır; linki oraya bırak.
- Linkler temizlenerek saklanır (`?igsh=`, `utm_` gibi takip parametreleri atılır) ve aynı link iki kez eklenmez.
- Eklenti ikonuna tıklayınca sepetteki linkleri görebilir, açabilir, silebilir veya hepsini kopyalayabilirsin.

Eklenti sayfanın içeriğini okumaz, yalnızca URL'yi saklar. Böylece Instagram arayüzü değiştiğinde bozulmaz.

## Kurulum

1. Chrome'da `chrome://extensions` adresini aç.
2. Sağ üstten **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** butonuna basıp `extension` klasörünü seç.
4. Açık Instagram sekmeleri varsa yenile.
