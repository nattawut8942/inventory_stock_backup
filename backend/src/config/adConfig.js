// ดึงค่า Config จากไฟล์ .env (ถ้าไม่มีใน .env จะดึงค่าหลังเครื่องหมาย || มาใช้แทน)
export const AD_CONFIG = {
    url: process.env.AD_URL || 'ldap://192.168.226.222:389',
    bindDN: process.env.AD_BIND_DN || 'dciadmin@dci.daikin.co.jp',
    bindPassword: process.env.AD_BIND_PASSWORD || 'B7m?M89h7Y',
    baseDN: process.env.AD_BASE_DN || 'DC=dci,DC=daikin,DC=co,DC=jp',
};

export default AD_CONFIG;