$token="O86Qe5h2agyjuBjtnWgna683gLI2DXz1b3mCgC5Ag7H3LYEMLNWbDXuVfvRYvZOSSMDmXDu8w0vyEct0RyyanzGtuFVpEZPBEcE2KEdJWsvpdfXIhv3Af7lHpNa8OyMhg7PfKKyVDoyjXyLi/Gwr7AdB04t89/1O/w1cDnyilFU="

$body = @{
  to = "Uxxxxxxxxxxxxxxxx"
  messages = @(
    @{ type="text"; text="測試推播成功" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
 -Uri https://api.line.me/v2/bot/message/push `
 -Method POST `
 -Headers @{ Authorization="Bearer $token" } `
 -ContentType "application/json" `
 -Body $body