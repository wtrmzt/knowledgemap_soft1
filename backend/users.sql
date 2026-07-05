-- 自動生成: ユーザー登録 SQL（Supabase SQL Editor に貼り付けて Run）
-- password_hash はローカルで pbkdf2 ハッシュ化済み。平文は含みません。
BEGIN;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('12345678', 'pbkdf2:sha256:1000000$vkwarASEYNC9vOAS$58077df8c5d0a2139252b594f67df8ae7b9d9bc90392ec3da344ae0e55504959', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('12345679', 'pbkdf2:sha256:1000000$irGH4yFn8l5HkqiP$4bc53f3e18db1d115d05694a6de5de5cf41d494c4bc498e04909cfc5cb0c2ae6', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('12345680', 'pbkdf2:sha256:1000000$YBFu1yzusI7Uu6CQ$7e7830d11158157bbf5480e002b8e99d2e66edbf4928dc6306e444a8e27afc30', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('test01', 'pbkdf2:sha256:1000000$7nspRBIuiQHtybyN$e11b56644002c021015286fe8dfd3d6911c39d5e93c4011ae5632da135c7afa9', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('test02', 'pbkdf2:sha256:1000000$IDNgYXsD0sZXoiCv$db588b43546f93a88b3ca81159c3f83878c712542911b95b6ea27b7be51b96dc', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('test03', 'pbkdf2:sha256:1000000$F5edKL8ocunHf31y$bc8fa218e068489494185c12a4e560e221907ea553418d9365e5796db0c39698', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2312052', 'pbkdf2:sha256:1000000$xWxfmuM8SSwDqp9C$9a344ac8365fba31292805376adf482b24153cf0845a5273100c850752ee848c', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2411519', 'pbkdf2:sha256:1000000$xFroZ32cc8KhGoO5$f84c83d53c7bdb56acbe09b280078741b7e5b03c865cf8c179577c15845d5bb4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2413643', 'pbkdf2:sha256:1000000$KcTR0jjwXn3FtiYH$e9b47478e93205d94e3e332e38eb88811a13e0e871e19aaa74d96f1f9a5baf67', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2413736', 'pbkdf2:sha256:1000000$QDXSN4HJdRjEtFwi$fe2e565b7623454de2d06b3ab52d5f8b15c9e10d3aae1e480a248b16b9fa8e75', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2511018', 'pbkdf2:sha256:1000000$47DTHQrI5qRi4uf4$73faf5661cdd46f8c7f2f4fff89d0046a11c6e245c28721e7da66f67c19cc95e', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('a2611003', 'pbkdf2:sha256:1000000$Vnmcfg8PCvPot41U$d453bf424235983e3b6b319c0ef41fd5b6a0869583f6eeedcc51215fcd96edb2', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('a2611007', 'pbkdf2:sha256:1000000$Yk6MFn8378eDPGsh$19d3a526943aa9ce863af7702222abb4566b1a7bb37da2aa8fb411ea87a8ad93', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('a2611011', 'pbkdf2:sha256:1000000$6AQwNKMamUDu1IkW$9ca83685302a8ddca757937a168dd2f9d99174a3fd54614782e9ed906a3d942c', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('a2611015', 'pbkdf2:sha256:1000000$yQpUt3YHOZY1ssS8$03a1af5214e67da7c62714ba70df5bb218779c8ecd10489d8c2b138840cec93a', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2611019', 'pbkdf2:sha256:1000000$15VBuvd2MGgDZah2$aa5e3128268eeb73993537993c53e74854a966dd8c5f11b6cf600cc93794de2e', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2611023', 'pbkdf2:sha256:1000000$CXLMnVpwRA7C1vpu$a197c9b2ce0af1cb1c74daf84056b79e488269040c629c38a203f3cac62639ac', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2611027', 'pbkdf2:sha256:1000000$4kb43zeakOxay8Bu$841edf589a361d69752ce54ffa55ade0ca79e33806d0ef2ebc07babfbce52e4b', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('i2611031', 'pbkdf2:sha256:1000000$IpVayoMjHSluQK2D$8c0605956282ab54a60b23c50a14809541563e06d0395d81b0b1ceb9f288ddc4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('u2611035', 'pbkdf2:sha256:1000000$8VQ5FoZSJwWxHsiW$91a34c46de9f543da59f784788a56365abd05ecc2e8b8dadf1cb7d3a53644d02', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('u2611039', 'pbkdf2:sha256:1000000$dpUu2xSHO1oGuA5F$17a8409833ef3a1bfdaadf163ec337161ae0d2a90078781d51c14e32bc447042', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('e2611043', 'pbkdf2:sha256:1000000$txz5O0lgIAfkWnMA$303d0456fb9b798ea8d899c63e69b65cd7376d855eb2dc22312ef951f39a24f6', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611047', 'pbkdf2:sha256:1000000$4c9Ol7x08eaQ3v9C$c699d25691c040907f0c5124dd9d31070722adb2011e8bd939ec4eed834ce080', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611051', 'pbkdf2:sha256:1000000$aNVrbn6V28BYP8KX$154aa99c29abaca1d8c07dd807f2c3737efc32b642dd9e0454c89c587d6dc20a', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611055', 'pbkdf2:sha256:1000000$3Ynxz8Ij3TBpCb25$a23ff3ece13bfd96c0ea6aee1d84908d9b8c77dc4d3473cbab546458040078e4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611059', 'pbkdf2:sha256:1000000$M7hm3iRYw6Jql3uA$f8ccb128c688cb64955b3c55ccaae7680028217a9584c3096220f516f2e2c841', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611063', 'pbkdf2:sha256:1000000$6BznrBuAChZk5ZHN$986154a522e23c337ce3030b90e4bc9cade2935eb5d733eab6ef7040370513ce', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611067', 'pbkdf2:sha256:1000000$K2KY70XHvqO2gx54$d0ad69a3f0f72e9420ee2cfa8c8891d65022efc08da35544da1e147c43d95628', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611071', 'pbkdf2:sha256:1000000$XHIfoihM9ziKtxfp$0076bb558e0f0d08c2da6d867cdc12a0c822a799fb5e7c5e8254c5719f931f39', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611075', 'pbkdf2:sha256:1000000$KXTbtznaIRzpwcty$c4f521684efc8ec7a54ddd7a60ff75848a0f11c4c0bd65cc30a6072f4196fbf8', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611079', 'pbkdf2:sha256:1000000$mQDp1lX9Fru2pXhk$fc9f9c445f9789015159a52c9c30730ebb013dd645d23746d7c66501a10b94c4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611083', 'pbkdf2:sha256:1000000$nfIzHK7XXlfNKNed$f44fa8df7b3cf83af4ab1e22e7a086cbb0904c582d788fef4c528746f9cd81fc', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611087', 'pbkdf2:sha256:1000000$3Utd2GPqMjyMCVSE$d8f9347c8910e245ae4f296980d2703876873b7c09cdb387e4571fe7bcc5b0c1', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611091', 'pbkdf2:sha256:1000000$Bl4Vs3Xr54T32TRl$5f6d37a6940d3050be4a289cda5e5063cf1b1dc31eff6da8a41cdea3a400cefd', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611095', 'pbkdf2:sha256:1000000$uD8WLJYILRGBCrJX$75d13f3c443dc21ec3f04ea2503ac20758518ba3a5d845a480c306a194f30c80', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611099', 'pbkdf2:sha256:1000000$l7s3OE6ErD9W32MG$5b88e510a4d7ea896b4d592b192390e40b7989f450ed35250ee506c511825aaf', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611103', 'pbkdf2:sha256:1000000$LstarM9KEwXp5OA8$cb70df290105dfc4a2b97392779e00df4f232f57db569584c78021425f6b3e00', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('k2611107', 'pbkdf2:sha256:1000000$wmTm14breIIeAnPo$a55bbfb3109f986a0d735bb35ae9bcd4d56477defffcdfbc2aa123ac9836a6be', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('g2611111', 'pbkdf2:sha256:1000000$nVKMPrNCuwxzsjqB$93019bfdf434e6b7fc63fbac4cf9d6bc0289acad1829ce07d25fcd441f46db9e', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611115', 'pbkdf2:sha256:1000000$vDpnehkgllK1MFkv$68b56379a565873ec11d1f2eec1a36fbed873540e178adf73780f6117b0c5f68', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611119', 'pbkdf2:sha256:1000000$Qrg1rzkmmiBZmYsI$234cdcad3510d6fb64809651eeac01918ef15290629fb2ec018845c6c6fb404f', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611123', 'pbkdf2:sha256:1000000$IE8fJly1thJHIeqy$21972cbf304c5f62115ace31240f285803d718bac77373fe4fb37c09f1998423', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611127', 'pbkdf2:sha256:1000000$9kuCNexX9pofXOv8$baabd382dd6175135bda259b5f8029f626397869865e56663b0062c1f2492df0', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611131', 'pbkdf2:sha256:1000000$Ss2w7lLOg1kIqyYO$97f0785a2c4da7a265126fd77eb604e85facf4b7c5f3636c6e444e142fe9c1af', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611135', 'pbkdf2:sha256:1000000$rJVmZTTvj0UwsIrf$fb7e5215c8d28914265492f8cb082c4f273de7381dddd057426be2c52d814a85', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611139', 'pbkdf2:sha256:1000000$fppYE4Tcq0GFWz3B$5df3aab8954cfa56c6b70211e9ddef16c8ebddcfa9e3165ab45578d69ea99f24', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('s2611143', 'pbkdf2:sha256:1000000$z4xVvVGCRr8Il0Mu$d1370b3daf1fd482e45b3dc7603f8557a01e193a55c9c5d2bd51e567112841b6', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611147', 'pbkdf2:sha256:1000000$mRPI0L7dKpeB5yhD$a7d6f041e8e72ff49c38107c988e6ab4f4d2b83a4182fdb8f968d40fb7c5fe01', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611151', 'pbkdf2:sha256:1000000$xuZWJbkQNMjrmaum$590fe2b43dd97e686e3790cf1e86a34fbde57f579013de3e16243800c778dfd0', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611155', 'pbkdf2:sha256:1000000$XQWV13bIjeYKqHLF$90ed7d9d235dda841b895c7a4bff69a032a4a27f3090f507b9bca7cc2f4e1f45', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611159', 'pbkdf2:sha256:1000000$A0iuh9nH3YLuqQzY$f7d63c16d4e0c2bf57ce367a9e0273efa12e056dabf89806adab2f7a003fdb8f', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611163', 'pbkdf2:sha256:1000000$d8MXR3KUQ1o0TO6r$606d39fc239848e9ea200c27d6aab43c5ce09a2eb24913aad6e669de64c7bb78', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611167', 'pbkdf2:sha256:1000000$pqEM3GMp1MOwSWDF$a9487c319f30c497c477d2e61a669b93c4b42447ae2241cbc5398ca32c3c639d', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611171', 'pbkdf2:sha256:1000000$y3vHwO4BeWIs7jS5$38cd1b40ffcf34d343deee2776329b1b28256ffec8d5c5452388d8bf35f58464', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('t2611175', 'pbkdf2:sha256:1000000$CvgQfBIjxcl3vdGP$6d812c31984067625597f877752f264c9d57fdf40a06153b7917aa3c31d9c40f', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('n2611179', 'pbkdf2:sha256:1000000$Ly05IeNpqEE3xKZo$f1a1f415ea836c1ed90b7f73a2e8b27830a99c3e1e6aad2d88c1e9e936246920', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('n2611183', 'pbkdf2:sha256:1000000$ZGJX1KbYUIVlaA08$d1c2c43a44b111c7931e2e2ecc861fa5d0fe434de2a85556652edf712cbed3ad', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('n2611187', 'pbkdf2:sha256:1000000$re9ACxqPfQIHAJnz$260fcdbc82e21d94c886b8dca360f8c61f5f0765c0ae6fb198bd0294ec0c2f34', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('n2611191', 'pbkdf2:sha256:1000000$FYvj24SVXlBFmsv8$4c41f34f95f2fa843ddda14711b47c07cdc9806f6476f8fb5cc097b6199eb342', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('h2611195', 'pbkdf2:sha256:1000000$Cph7R3rBtEcHcEsJ$d447d94bf8d71bc14b2bee425caf128f06319dd93ad3bb993fb571d59de14ec3', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('h2611199', 'pbkdf2:sha256:1000000$wQt52PDv4CRChbUN$915f17da275eec6f3f7ee88bc86f0f160a4390550ff32ec7bd2f5de3b9115630', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('h2611203', 'pbkdf2:sha256:1000000$2PAhvmUSlHaEY2zI$16c7070d94444846d7ee48a71e347fdbc733eabda5637fad8b8bdb63556878b5', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('f2611207', 'pbkdf2:sha256:1000000$z4sXrzpL9nA6ji9i$5f8bf7d8aaff7232a10120af9f3ffe453f3efc5e2bb2346685ea896c9021191d', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('f2611211', 'pbkdf2:sha256:1000000$Nar2OMa3UMOxgx5Q$54175d4dcd1bf6c4a5124041fa9d59a91e65179fdf0d075352cb12621b6a168d', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('f2611215', 'pbkdf2:sha256:1000000$9ur5UVeYxwv7SIGD$b34c248a043c8b597958a58c2d15b942a9c215ede04e95a8efd537bb2f1cbece', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('h2611219', 'pbkdf2:sha256:1000000$xrt017AKPhJ07vjI$e77dd4ad2da6537ecb66d796f4f7fe31ef2c7445a58efed1a339408cae18b50a', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611223', 'pbkdf2:sha256:1000000$sxV5X79Jag0EvMaW$6ba9820b4cf58fa21d2834fde5e2c687de954b9318105862aa2c5f533afe69fd', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611227', 'pbkdf2:sha256:1000000$qT2Sg8unBylUdcCa$45abbabc7727905109419125042050335f1f877da69d7df13043e71ce81ef108', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611231', 'pbkdf2:sha256:1000000$2a3HfKQIHthexNaR$0a9082f790035e19616a5cac1ed1c5009cd1f39f656c366fd1dc7955e86516d4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611235', 'pbkdf2:sha256:1000000$ZYUoRuG2QBeBHgqR$6522be607f9a0ffc62698921fb45d160ff23b5e9a936514fe016c1ba2f9cfc5d', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('m2611239', 'pbkdf2:sha256:1000000$CbQ57Zjoo7xLbHao$05c3ecb74b0f474142cb2382596f5a834fb3b245e698d4bf00a9ed87c4d1e881', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611243', 'pbkdf2:sha256:1000000$cTg86nE1QM4MeVk7$43667fd9affe17d2be16942841c74ca9c6afbd8423ef17f97ba16b0f97583bd3', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611247', 'pbkdf2:sha256:1000000$GUMAUG2r7FZeniQT$d4171568cb422e67146e2606c5eb603bd6e7d5ae8aface9dbc932f2ba1b19cbc', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611251', 'pbkdf2:sha256:1000000$40RoaWyYd8wyuKqm$dc8b5ab94c07458ee03a7000770c20b619e840a63ba40ec5e6424b56798998d4', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611255', 'pbkdf2:sha256:1000000$q5uib1pjwo2OE2pW$c9c492574487ccc17a592b2fa732eec6863fbb0655f63cda89388293611a1151', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('y2611259', 'pbkdf2:sha256:1000000$LlcTrNc2YDIysj1M$7301e61a0ddb89608266431abe139edd5276bbf232b285bd1c1bf89c7c2dcb56', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('w2611263', 'pbkdf2:sha256:1000000$svrPXTBhGkveD57W$0e00373e3e2afee7b819f1cd4c98018dcfc71f22c2375aff4fa1525c81e46fd0', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('w2611267', 'pbkdf2:sha256:1000000$Vy3ZmQ1DH4e58puT$bc7567e73a9cb35976e12a52f0a1f9767367990e99e16d6bb38a16c22e2c3dd2', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('o2611183', 'pbkdf2:sha256:1000000$s63EGuqdWz5sbh8o$78cbd4df4bd87545b4361a96125e150e449bde82b67408d7875badf3d54c24df', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
COMMIT;
