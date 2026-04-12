import ldap from 'ldapjs';
import dotenv from 'dotenv';
import { AD_CONFIG } from '../config/adConfig.js'; // ✅ Import Config เข้ามาใช้งาน

// ========== AD CONFIG ==========
// แนะนำให้ย้ายไปไว้ใน .env
// const AD_CONFIG = {
//     url: process.env.AD_URL,
//     bindDN: process.env.AD_BIND_DN,
//     bindPassword: process.env.AD_BIND_PASSWORD,
//     baseDN: process.env.AD_BASE_DN,
// };
// ================================

// Helper: สร้าง LDAP Client และ Bind
const createLdapClient = () => {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({
            url: AD_CONFIG.url,
            timeout: 5000,
            connectTimeout: 5000,
        });

        client.on('error', (err) => reject(err));

        client.bind(AD_CONFIG.bindDN, AD_CONFIG.bindPassword, (err) => {
            if (err) return reject(err);
            resolve(client);
        });
    });
};

// Helper: แปลง entry เป็น plain object (รองรับทั้ง ldapjs v2 และ v3)
const entryToObject = (entry) => {
    const obj = {};
    if (entry.pojo?.attributes) {
        entry.pojo.attributes.forEach(attr => {
            obj[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
        });
        if (entry.pojo.objectName) obj.dn = entry.pojo.objectName;
    } else if (entry.object) {
        Object.assign(obj, entry.object);
    }
    return obj;
};

// Helper: LDAP Search — รองรับ paged และจับ SizeLimitExceeded
const ldapSearch = (client, baseDN, filter, attributes, scope = 'sub') => {
    return new Promise((resolve, reject) => {
        const results = [];
        const opts = {
            filter,
            scope,
            attributes,
            sizeLimit: 0,
            paged: { pageSize: 500, pagePause: false },
        };
        client.search(baseDN, opts, (err, res) => {
            if (err) return reject(err);
            res.on('searchEntry', (entry) => {
                const obj = entryToObject(entry);
                if (Object.keys(obj).length > 0) results.push(obj);
            });
            res.on('error', (err) => {
                if (err.name === 'SizeLimitExceededError') resolve(results);
                else reject(err);
            });
            res.on('end', () => resolve(results));
        });
    });
};

// ========== TEST CONNECTION ==========
export const testConnection = async (req, res) => {
    try {
        const client = await createLdapClient();
        client.unbind();
        res.json({ success: true, message: 'Connected to Active Directory successfully' });
    } catch (err) {
        console.error('AD Connection Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ========== GET USERS ==========
export const getUsers = async (req, res) => {
    const { q = '' } = req.query;
    try {
        const client = await createLdapClient();

        const filter = q
            ? `(&(objectClass=user)(objectCategory=person)(|(sAMAccountName=*${q}*)(displayName=*${q}*)(mail=*${q}*)))`
            : '(&(objectClass=user)(objectCategory=person))';

        const attrs = [
            'sAMAccountName', 'displayName', 'mail', 'department',
            'title', 'telephoneNumber', 'memberOf', 'userAccountControl',
            'whenCreated', 'distinguishedName', 'description',
        ];

        const users = await ldapSearch(client, AD_CONFIG.baseDN, filter, attrs);
        client.unbind();

        const formatted = users.map((u) => ({
            username: u.sAMAccountName || '',
            displayName: u.displayName || '',
            email: u.mail || '',
            department: u.department || '',
            title: u.title || '',
            phone: u.telephoneNumber || '',
            description: u.description || '',
            groups: Array.isArray(u.memberOf)
                ? u.memberOf
                : u.memberOf
                ? [u.memberOf]
                : [],
            enabled: !((parseInt(u.userAccountControl) & 2)),
            created: u.whenCreated || '',
            dn: u.distinguishedName || '',
        }));

        res.json({ success: true, count: formatted.length, data: formatted });
    } catch (err) {
        console.error('Get Users Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ========== GET COMPUTERS ==========
export const getComputers = async (req, res) => {
    const { q = '' } = req.query;
    try {
        const client = await createLdapClient();

        // ✅ แก้ไขตรงนี้: เพิ่ม (operatingSystem=*${q}*) เข้าไปในกลุ่ม OR (|)
        const filter = q
            ? `(&(objectClass=computer)(|(cn=*${q}*)(dNSHostName=*${q}*)(operatingSystem=*${q}*)))`
            : '(objectClass=computer)';

        const attrs = [
            'cn', 'dNSHostName', 'operatingSystem', 'operatingSystemVersion',
            'description', 'whenCreated', 'distinguishedName',
        ];

        const computers = await ldapSearch(client, AD_CONFIG.baseDN, filter, attrs);
        client.unbind();

        const formatted = computers.map((c) => ({
            name: c.cn || '',
            hostname: c.dNSHostName || '',
            os: c.operatingSystem || '',
            osVersion: c.operatingSystemVersion || '',
            description: c.description || '',
            created: c.whenCreated || '',
            dn: c.distinguishedName || '',
        }));

        res.json({ success: true, count: formatted.length, data: formatted });
    } catch (err) {
        console.error('Get Computers Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ========== GET GROUPS ==========
export const getGroups = async (req, res) => {
    const { q = '' } = req.query;
    try {
        const client = await createLdapClient();

        const filter = q
            ? `(&(objectClass=group)(cn=*${q}*))`
            : '(objectClass=group)';

        const attrs = [
            'cn', 'description', 'member', 'groupType',
            'distinguishedName', 'whenCreated',
        ];

        const groups = await ldapSearch(client, AD_CONFIG.baseDN, filter, attrs);
        client.unbind();

        const formatted = groups.map((g) => {
            let members = g.member || [];
            if (!Array.isArray(members)) members = [members];

            const gType = parseInt(g.groupType) || 0;
            const typeLabel = gType & -2147483648 ? 'Security' : 'Distribution';
            let scopeLabel = 'Unknown';
            if (gType & 4) scopeLabel = 'Domain Local';
            else if (gType & 2) scopeLabel = 'Global';
            else if (gType & 8) scopeLabel = 'Universal';

            return {
                name: g.cn || '',
                description: g.description || '',
                memberCount: members.length,
                members: members.map((m) => m.split(',')[0].replace('CN=', '')),
                type: typeLabel,
                scope: scopeLabel,
                created: g.whenCreated || '',
                dn: g.distinguishedName || '',
            };
        });

        res.json({ success: true, count: formatted.length, data: formatted });
    } catch (err) {
        console.error('Get Groups Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ========== GET OU STRUCTURE ==========
export const getOUStructure = async (req, res) => {
    try {
        const client = await createLdapClient();

        const filter = '(|(objectClass=organizationalUnit)(objectClass=domain))';
        const attrs = ['ou', 'distinguishedName', 'description', 'name'];

        const ous = await ldapSearch(client, AD_CONFIG.baseDN, filter, attrs);
        client.unbind();

        // Build tree from DN
        const nodes = {};
        const roots = [];

        ous.forEach((ou) => {
            nodes[ou.distinguishedName] = {
                name: ou.ou || ou.name || ou.distinguishedName.split(',')[0],
                dn: ou.distinguishedName,
                description: ou.description || '',
                children: [],
            };
        });

        ous.forEach((ou) => {
            const parentDN = ou.distinguishedName.split(',').slice(1).join(',');
            if (nodes[parentDN]) {
                nodes[parentDN].children.push(nodes[ou.distinguishedName]);
            } else {
                roots.push(nodes[ou.distinguishedName]);
            }
        });

        res.json({ success: true, data: roots });
    } catch (err) {
        console.error('Get OU Structure Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ========== GET OU MEMBERS ==========
// ดึง users และ computers ที่อยู่ใน OU นั้นโดยตรง (one level ลึก)
// ใช้ baseDN = ouDN และ scope = 'one' เพื่อดึงเฉพาะ direct children
// หรือ scope = 'sub' เพื่อดึงทั้งหมดรวม sub-OU
export const getOUMembers = async (req, res) => {
    const { dn, scope = 'one' } = req.query;
    if (!dn) return res.status(400).json({ success: false, error: 'dn is required' });

    try {
        const client = await createLdapClient();

        const searchScope = scope === 'sub' ? 'sub' : 'one';

        // ดึง users ใน OU นี้
        const userFilter = '(&(objectClass=user)(objectCategory=person))';
        const userAttrs  = ['sAMAccountName', 'displayName', 'mail', 'department',
                            'title', 'telephoneNumber', 'userAccountControl',
                            'whenCreated', 'distinguishedName'];

        // ดึง computers ใน OU นี้
        const compFilter = '(objectClass=computer)';
        const compAttrs  = ['cn', 'dNSHostName', 'operatingSystem',
                            'operatingSystemVersion', 'description',
                            'whenCreated', 'distinguishedName'];

        const [rawUsers, rawComputers] = await Promise.all([
            ldapSearch(client, dn, userFilter, userAttrs, searchScope),
            ldapSearch(client, dn, compFilter, compAttrs, searchScope),
        ]);

        client.unbind();

        const users = rawUsers.map(u => ({
            username:    u.sAMAccountName || '',
            displayName: u.displayName    || '',
            email:       u.mail           || '',
            department:  u.department     || '',
            title:       u.title          || '',
            phone:       u.telephoneNumber || '',
            enabled:     !((parseInt(u.userAccountControl) & 2)),
            created:     u.whenCreated    || '',
            dn:          u.distinguishedName || '',
        }));

        const computers = rawComputers.map(c => ({
            name:        c.cn             || '',
            hostname:    c.dNSHostName    || '',
            os:          c.operatingSystem || '',
            osVersion:   c.operatingSystemVersion || '',
            description: c.description   || '',
            created:     c.whenCreated   || '',
            dn:          c.distinguishedName || '',
        }));

        res.json({ success: true, users, computers, total: users.length + computers.length });
    } catch (err) {
        console.error('Get OU Members Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};