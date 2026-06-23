-- 自動生成: ユーザー登録 SQL（Supabase SQL Editor に貼り付けて Run）
-- password_hash はローカルで pbkdf2 ハッシュ化済み。平文は含みません。
BEGIN;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('12345678', 'pbkdf2:sha256:1000000$JNmDnpah8vF5A522$ef6e3f917c6a74c9c31709acc4c6123521a3454c593eb60b4b1492e5889d3b31', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('12345679', 'pbkdf2:sha256:1000000$3BNkqYZCCtTaog4e$dc047bd17ec2d4ca3d9b93d43df36d7a7f4cfde1e6b39e4029c12d54a0e126a5', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('12345680', 'pbkdf2:sha256:1000000$Wp2lCKUCx1yaetLk$7826656e73b1cfbe3b6fca7de8a28f42bb14dea691467cf363e4a6772b5b6429', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('test01', 'pbkdf2:sha256:1000000$fx26ZbWkLHMmwoDt$c7630f40dca0d93a6f4a3227a922959ba323a1c3a9b6a978c3651f7475a163a1', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('test02', 'pbkdf2:sha256:1000000$RZjQqyPWxJausZER$2070ef287a2c132b1c3439dbb6518ef12937dcf90182a5328f5bb5f858d07f4a', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('test03', 'pbkdf2:sha256:1000000$gNGTAhN2K0MmzFWF$8b73a1bb1ed35d188e79049b921e36bea35a7845a4eb8c051c8852f2bb725cf2', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2312052', 'pbkdf2:sha256:1000000$ycHTBVsgwpfZSlul$7aadf16ad1510bc2e4d2e18f6b30c37f1bbb15447b112992b0a72b55705abbb5', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2411519', 'pbkdf2:sha256:1000000$lE33xJ6McUPVIgEY$c3c8a18d790c9bb3d8a5fd8839c187ffd1be4ee703bcfcbf0af4d5dc3ed9292e', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2413643', 'pbkdf2:sha256:1000000$xzlcTGrfW45oZpns$0ccb7159540b153cc5d02ac6ccd0223e3f0ceecd63ddf1285d06f2fcccf62452', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2413736', 'pbkdf2:sha256:1000000$H9wXCzUmn4pUvcCj$df3647d642a43d795c68f165caecfb67369feee1d080770d7e848d0eb9be7ec1', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2511018', 'pbkdf2:sha256:1000000$lVi3chObTgy0Ky5I$68e0d35f5f1b0aa4f666bfce91adeb939b7496bc0813ee681a8de4e933d610a6', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('a2611003', 'pbkdf2:sha256:1000000$PC4HxJNBo86kmq5U$75ed94d5135d0e2597ceba464d31a46c6685f1a5d81603f2aab335687798dde5', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('a2611007', 'pbkdf2:sha256:1000000$HoNUA8YwIkl7Mpft$6b268a5f72ba94128f7c573e54b11abc62ca1276f1e06732f195684e9ce45c6c', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('a2611011', 'pbkdf2:sha256:1000000$A3oDAYfZjSWMUVmg$cedd4bc35538fd25a61a87fe18c7594daea5a4704c1837773b1afa8dc0fc7036', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('a2611015', 'pbkdf2:sha256:1000000$CcTiOy8ijCVgR7AT$c13cd5ee44b7862cccc3eff833de92ffd06b2f3e9183e017d50b8cb3a68cc11f', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2611019', 'pbkdf2:sha256:1000000$xnATc16Q3xuqYrT3$af7906473ca02dc2d4ed2ae64577415946ac861c3660cb4ba7a06fcb9bba36d0', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2611023', 'pbkdf2:sha256:1000000$fGIumGmxksOyvFvY$e3243bdc30e9964e02a0cd1e0569ea5c6f6e4a7e6c0b0474dc55e9b20c2d49ee', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2611027', 'pbkdf2:sha256:1000000$sVU1IfiAWhMR5Rsk$e1e51d2e3208552dbbccc14739e8a72f90794e8417acc1e87889d2b6106f3064', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2611031', 'pbkdf2:sha256:1000000$pebr14mA37iu6Wls$4ea4cad8c4190fc9920c4c532f6a852a71d780ddcd83849003c673d119ff7765', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('u2611035', 'pbkdf2:sha256:1000000$nB0zbhq27H16gPHM$8473ba4f110d6af63e75632747acf439706232df458da14253b79d4ff7612790', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('u2611039', 'pbkdf2:sha256:1000000$Rqikz8c1eddsKI8j$f8d9efba93c2be2678dcfd886a76d64a0d66254332ec351ec32e05d38c64f6e5', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('e2611043', 'pbkdf2:sha256:1000000$7WZaOYs5v9ZwJIL0$2a6c31929c6c5c3c8314037da432a9fc14c8509ab766fcfd7418e140cc7fb8c5', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611047', 'pbkdf2:sha256:1000000$LC1LDquA6uVol8x3$af0220cacd47e852be42b02ec3fd55af0a770b4977c8d47377d66c17f0c0285e', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611051', 'pbkdf2:sha256:1000000$OQCpJG3uSOqE3ZL3$113c8a64deab805d86dc652f5178fb21059d77be8bb8f5bbd5130a220e21212e', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611055', 'pbkdf2:sha256:1000000$YxZny8YgDIfu8ERU$92bba2085bd92292b7ad87c9b37b7942f91ad5291a23a31adfa8ac3ecd540af4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611059', 'pbkdf2:sha256:1000000$9nvhyeGPIfasPcYO$f495d790474a15ec4fb66dbd0c72295dab5dd5adc1fe95821be6f25a8b7e2926', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611063', 'pbkdf2:sha256:1000000$jSvEbAusyEUerT5U$ba90ee456b252c6b54afa1529881d076142d4c93a07517ebd6ff75edfba50bd8', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611067', 'pbkdf2:sha256:1000000$DJuiDEeHhUQBpzRj$32acfa4e5837db38a771f52b787dd9ce2043760ea562092c8e6509bcb1255d0b', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611071', 'pbkdf2:sha256:1000000$H9sPsWXkDgHX6bz4$c229de3ab684c0b1cb4cedd6a40d8ac8f48f8426628b42e36c0b3fc202b7d6e0', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611075', 'pbkdf2:sha256:1000000$pODAVi9tvEJL0DpA$1990d028418aac99ed2c4f04c48110d9e72febaf483781f1c8236cbf181a39fc', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611079', 'pbkdf2:sha256:1000000$03xucO0Y27S1kcr7$90023db5db0495a265d6db4805886f8f2a2a723bfb973306c340e2b134fd2cfe', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611083', 'pbkdf2:sha256:1000000$gGVIPkNHVd2PtVZG$c2fb1e7b426d9ac2275b65f1fef4a1553f8ca7154819dcba2db39465a961adee', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611087', 'pbkdf2:sha256:1000000$km40D1quMvKwbbG5$151fe946173748d410575291ccc91c04ddbc13578226824d63745cd38c05c882', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611091', 'pbkdf2:sha256:1000000$xRb6fvur7FWhShbL$a5663d3639444bd98888324cc240f69d4845e7f241a7ed277439df6f96a04eef', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611095', 'pbkdf2:sha256:1000000$ObktxP2quQh3PTr6$8a646c7cb4bb8565a778de8113e4981dcbdd4f592af39267cbe57ddd98bf88b2', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611099', 'pbkdf2:sha256:1000000$3bTbcjGuC5PtQbpK$e65448ec90bdf0135fac424031ce0c7c67a24007d5e34c8229af2d6afd2cae81', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611103', 'pbkdf2:sha256:1000000$JLp2pCeJ5kbANReK$1c1ac7330eaba87d8d7fca9a07be683001d3e4dc5a28f6ccd775076e269cff12', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611107', 'pbkdf2:sha256:1000000$s212W3FQfz1fCoXy$40da01116aac15ffc31201e220871cd423e25468c2df1b84fcf7570dbd5c1302', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('g2611111', 'pbkdf2:sha256:1000000$dvHsBZIbmo2i9RXo$bbec4f75fefb694db39b25cf800f44eae8219b967959bbe3a90692bf286f6096', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611115', 'pbkdf2:sha256:1000000$LvNP8KGQsoFpqXIV$6cc3a68035da7274bdbe30e8c16b07fcf8eae1620b1d6dd7cb68de68c42f4b8a', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611119', 'pbkdf2:sha256:1000000$tzon3RRcxxYZttiz$bcd9a55f57a6b5b4d999cdd0e803968237a00a3eda92bd43c0ed947699bab816', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611123', 'pbkdf2:sha256:1000000$aGyXwsJ4sXX4BstQ$a2b52eadfee2184af9bacfaf00c64754b147dbf2641178001aa568492280c99f', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611127', 'pbkdf2:sha256:1000000$GwATVKGsVlUFhrAd$980a88566e80147034e169f0f70ac05aaea373d8aa61e37bdfbed40434d279b4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611131', 'pbkdf2:sha256:1000000$SgRDCE9tAQBE8CmY$e34ea6d6f2a476b44053765e0e66d7232bb4f49ae31532501c6279ce691d89fb', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611135', 'pbkdf2:sha256:1000000$0jJ7peu1ecwaNu3v$62f1e9dca86ad3dd666a4237bf50762ebebba49601aac8978ad8395b68bdd8c2', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611139', 'pbkdf2:sha256:1000000$FfeTrdVCIrDr9reo$1bfef14b43556644880228e2417b9044f16ad544077d466fae060f6a0df1f21b', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611143', 'pbkdf2:sha256:1000000$HnXSKy1gKHIeyEvi$29a02a54073c3bc9a0a6e7de7a3166d424b66690b9c26a2aa29b94e78d0a33b7', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611147', 'pbkdf2:sha256:1000000$FjwheyvqSMx0nmdU$59a381b453a1c1657369e03ab4ec967a0a80c21e1a64d77aa71a92c8901d8eb4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611151', 'pbkdf2:sha256:1000000$PK0vopRD54rbulbF$81ba2cf9be2cfa3fcd79cffde36f662f7110f47d64dbb3e78a4fa7cab63126b6', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611155', 'pbkdf2:sha256:1000000$CvMTeBbch3Phyb0h$eb8f09070e8720c88b44a82bb4de02af8fed1fa6e9b3ca5961f82bb09fd7e29a', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611159', 'pbkdf2:sha256:1000000$JnO8XeB44M8Qfn3S$0cdf3b03c00a87d98d2205018f4338465e19f479e263882a49bf79c2f79b99f2', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611163', 'pbkdf2:sha256:1000000$Qm9LnKyhIVKX1mq5$c52b5e9fbd7ed72e37404f239347ae56d1af3331073b385f41a3554ae18406d8', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611167', 'pbkdf2:sha256:1000000$9TKvFaN0hHc8PC3Y$b96c311a4adb27d60fc0dc86a13bf22c74963813c29012620e8fcd1bc84523e0', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611171', 'pbkdf2:sha256:1000000$C2fkyqQI0pTD5fMp$4d699a8b8a1d9d3708a5bf99a15805bf2189daed0334c929a82d9c77445f4487', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611175', 'pbkdf2:sha256:1000000$77qrjoZtIAqo5riI$ce4d2a2513e17ebfa60e689171dc23dbb8037aeb1118326bcd6701525587b100', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('n2611179', 'pbkdf2:sha256:1000000$C1fd7LkGJwndTNBb$9f4e63f82c233e7bba0ad2b2f60f8f9a95e2999bca490ec770cab9374ffcb389', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('n2611183', 'pbkdf2:sha256:1000000$p29yanpJUQ4cL9aN$96b33e540103fb509a87e8c6a11cb35f36976f8e580b6938e3a0e55271443ace', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('n2611187', 'pbkdf2:sha256:1000000$guu1m89C5zn35McU$4e2760b35ef2e9c72d84ecf29b0dc637b3d936472f8997e6b9f608f1b9b99686', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('n2611191', 'pbkdf2:sha256:1000000$hx1MmGMrkbHRSb5Z$365c8150e46569095215a73292a78be01d5db45a7cd159299aa7ac2e224e1f7f', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('h2611195', 'pbkdf2:sha256:1000000$tqf9dX8txbaYAIXk$3d379443c37d1b67d51ce2ba20f083d7bfaa02917edf08bc4228d0655979e054', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('h2611199', 'pbkdf2:sha256:1000000$kicj8i0UQGXFPJJD$7f1ae92d9b05dfc684579085e351b0d86063e8a6cf8bb72702b5b1ee0d98e075', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('h2611203', 'pbkdf2:sha256:1000000$D6WX4JEzEWCFEesW$2cd7945842a00e45deb757708421816ebe40fc666ffd9e001573a8ed5b039c80', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('f2611207', 'pbkdf2:sha256:1000000$CTTMI2UoIwGY6sNC$6b0a631b2642442ff86fb31dfaaa0d73881832058b46716c9dd93bf5b96a1a7d', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('f2611211', 'pbkdf2:sha256:1000000$gs5Erku5wkXkM69y$68722e07504db08c62b0f9d181fdcf564ad42df87c3151a063a8c5cb08d22a15', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('f2611215', 'pbkdf2:sha256:1000000$2w6uO8JFwjJ7quri$b585790253e9965a7d4a5211c87f97be080f68ce35b6faa208d564a1e412dc10', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('h2611219', 'pbkdf2:sha256:1000000$CloqLAR16CSrO6q4$2a5387c6da96c1a1bcd4b0147fcc54a6a70f32ad55dc1e431fc5679e32bd12e6', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611223', 'pbkdf2:sha256:1000000$0t1sTLSCr0Nme9nG$bda2f5eeca989eb6ddf74f5091135991bb5bf031c9249eaadfa1823246fb2c9c', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611227', 'pbkdf2:sha256:1000000$Dn9uOHTrm3xC64i3$429e38d1c23d610518b2306d117143335dd20efab37d754d8509a5d30b8efc87', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611231', 'pbkdf2:sha256:1000000$WiSdxUmdPdqBo2AZ$fa4d6e1d875909137683d33ab99f863f03633a03c4be111f8154941b5a24dd81', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611235', 'pbkdf2:sha256:1000000$2XTAcItDT03Ps78E$80b3dc068a41f9e4594c81877347905298df9faf909e051a28f1ae8a2588c861', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611239', 'pbkdf2:sha256:1000000$iScUTGeX6u4PNzin$f4bb93c3499246e4010cd56f779436c743f4bc99ed90e7e427b76d5a2a35ba2c', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611243', 'pbkdf2:sha256:1000000$pr4L7XT4K7Pcfmut$0def0c14e8010c0ab1206c1729ae3efabdfe87ec2953f1eff532fffb0e177f9b', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611247', 'pbkdf2:sha256:1000000$RW63YgYCFPHRMVti$0e5d9143bdc84ab8fedecd80124229b747e26df5dcbdc18a8e316ea32fa9414c', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611251', 'pbkdf2:sha256:1000000$s6nP3SuP2HZ9utVw$5d76ef77bc6c14d7c76e6fa8369eaca2243a786b9e9ffacf486d7f76f76db651', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611255', 'pbkdf2:sha256:1000000$sLFxTgVj3WD4maeT$065d548d3274e297bae863009b1a04bf834600a06f9524e2246fcb64d9845409', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611259', 'pbkdf2:sha256:1000000$3Prn0qU0Tb36YDzg$6a3ba4b1f720ec342024fbf26e73b0cf8324093c0e31d0e3063163e0f18d2999', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('w2611263', 'pbkdf2:sha256:1000000$rgvVP7Cu75yzZxQk$878bad0428444d56b4965e35fa4bcc767e767838cb6aacfc046c044df0049c55', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('w2611267', 'pbkdf2:sha256:1000000$eUXxIaewvO2jwIIc$a717c769bdf31d9b22a4967bb21da7c424853cfe4e5c7177a5843a4227405556', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
COMMIT;
