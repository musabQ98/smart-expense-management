

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'SmartExpenseProDB'
});

function getDateQuery(req) {
    const period = req.query.period || 'all';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    if (period === 'week') return "AND date >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    if (period === 'month') return "AND date >= DATE_FORMAT(NOW(), '%Y-%m-01')";
    if (period === 'year') return "AND date >= DATE_FORMAT(NOW(), '%Y-01-01')";
    if (period === 'custom' && startDate && endDate) {
        return "AND date BETWEEN '" + startDate + "' AND '" + endDate + "'";
    }
    return "";
}

app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const [results] = await db.query('SELECT * FROM User WHERE email = ?', [email]);
        if (results.length > 0) return res.json({ success: false, message: 'Email exists' });

        const [result] = await db.execute('INSERT INTO User (name, email, password, registrationDate) VALUES (?, ?, ?, NOW())', [name, email, password]);
        res.json({ success: true, userID: result.insertId });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [results] = await db.query('SELECT * FROM User WHERE email = ? AND password = ?', [email, password]);
        if (results.length > 0) res.json({ success: true, user: results[0] });
        else res.json({ success: false, message: 'Invalid Credentials' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/user-info/:id', async (req, res) => {
    try {
        const [results] = await db.query('SELECT name, email FROM User WHERE userID = ?', [req.params.id]);
        // التعديل هنا: نضمن إرجاع كائن فارغ إذا لم نجد المستخدم، مما يمنع تعطل loadProfile
        res.json(results[0] || {}); 
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/update-profile/:id', async (req, res) => {
    const { name, email } = req.body;
    try {
        await db.execute('UPDATE User SET name = ?, email = ? WHERE userID = ?', [name, email, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/change-password/:id', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
        const [results] = await db.query('SELECT * FROM User WHERE userID = ? AND password = ?', [req.params.id, currentPassword]);
        if (results.length === 0) return res.json({ success: false });
        
        await db.execute('UPDATE User SET password = ? WHERE userID = ?', [newPassword, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/add-income', async (req, res) => {
    const { userID, amount, source, date } = req.body;
    try {
        await db.execute('INSERT INTO Income (userID, amount, source, date) VALUES (?, ?, ?, ?)', [userID, amount, source, date]);
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/add-expense', async (req, res) => {
    const { userID, amount, category, description, date } = req.body;
    try {
        await db.execute('INSERT INTO Expenses (userID, amount, category, description, date) VALUES (?, ?, ?, ?, ?)', [userID, amount, category, description, date]);
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/add-goal', async (req, res) => {
    const { userID, goalName, targetAmount } = req.body;
    try {
        await db.execute('INSERT INTO Goals (userID, goalName, targetAmount, currentAmount) VALUES (?, ?, ?, 0)', [userID, goalName, targetAmount]);
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/summary/:userID', async (req, res) => {
    const userID = req.params.userID;
    const dateCond = getDateQuery(req);
    try {
        const [inc] = await db.query("SELECT SUM(amount) as total FROM Income WHERE userID = ? " + dateCond, [userID]);
        const [exp] = await db.query("SELECT SUM(amount) as total FROM Expenses WHERE userID = ? " + dateCond, [userID]);

        res.json({ totalIncome: inc[0].total || 0, totalExpense: exp[0].total || 0, balance: (inc[0].total || 0) - (exp[0].total || 0) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/all-expenses/:userID', async (req, res) => {
    try {
        const [r] = await db.query("SELECT * FROM Expenses WHERE userID = ? " + getDateQuery(req) + " ORDER BY date DESC", [req.params.userID]);
        res.json(r);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/all-income/:userID', async (req, res) => {
    try {
        const [r] = await db.query("SELECT * FROM Income WHERE userID = ? " + getDateQuery(req) + " ORDER BY date DESC", [req.params.userID]);
        res.json(r);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/goals/:userID', async (req, res) => {
    try {
        const [r] = await db.query('SELECT * FROM Goals WHERE userID = ?', [req.params.userID]);
        res.json(r);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/add-savings/:id', async (req, res) => {
    const { amountToAdd } = req.body;
    try {
        const [result] = await db.execute('UPDATE Goals SET currentAmount = currentAmount + ? WHERE goalID = ?', [amountToAdd, req.params.id]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/delete-income/:id', async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM Income WHERE incomeID = ?', [req.params.id]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/delete-expense/:id', async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM Expenses WHERE expenseID = ?', [req.params.id]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/delete-goal/:id', async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM Goals WHERE goalID = ?', [req.params.id]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/employee-login', async (req, res) => {
    const { email, password, role } = req.body; 
    try {
        const [results] = await db.query('SELECT * FROM employee WHERE email = ? AND password = ? AND role = ?', [email, password, role]);
        if (results.length > 0) res.json({ success: true, employee: results[0] });
        else res.json({ success: false, message: 'Invalid Credentials or Role Mismatch' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/all-employees', async (req, res) => {
    try {
        const [r] = await db.query("SELECT * FROM employee WHERE role != 'SystemAdmin'");
        res.json(r || []);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/user-stats', async (req, res) => {
    const { period, startDate, endDate } = req.query;
    let condition = "";
    if (period === 'today') condition = "AND DATE(registrationDate) = CURDATE()";
    else if (period === 'week') condition = "AND registrationDate >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    else if (period === 'month') condition = "AND registrationDate >= DATE_SUB(NOW(), INTERVAL 1 MONTH)";
    else if (period === 'year') condition = "AND registrationDate >= DATE_SUB(NOW(), INTERVAL 1 YEAR)";
    else if (period === 'custom' && startDate && endDate) condition = `AND DATE(registrationDate) BETWEEN '${startDate}' AND '${endDate}`;

    const sql = `SELECT COUNT(*) as count FROM User WHERE 1=1 ${condition}`;
    try {
        const [result] = await db.query(sql);
        res.json({ count: result[0].count });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/add-complaint', async (req, res) => {
    const { userID, subject, description, date, status } = req.body; 
    
    const sql = `INSERT INTO tickets (userID, subject, description, status, dateCreated) VALUES (?, ?, ?, ?, ?)`;
    try {
        const [result] = await db.execute(sql, [userID, subject, description, status, date]); 
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/user/tickets/:userID', async (req, res) => {
    const userID = req.params.userID;
    const sql = 'SELECT ticketID, subject, status, employee_response, dateCreated FROM tickets WHERE userID = ? ORDER BY dateCreated DESC';
    try {
        const [results] = await db.query(sql, [userID]);
        res.json(results);
    } catch (err) {
        return res.status(500).json([]);
    }
});

app.get('/api/tickets', async (req, res) => {
    const sql = `
        SELECT t.*, IFNULL(u.name, 'مستخدم') as userName 
        FROM tickets t 
        LEFT JOIN User u ON t.userID = u.userID 
        ORDER BY t.dateCreated DESC
    `;
    try {
        const [results] = await db.query(sql);
        res.json(results);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/tickets/:id', async (req, res) => {
    const { status, response, employeeID } = req.body;
    const id = req.params.id;

    const sql1 = 'UPDATE tickets SET status = ?, employee_response = ?, employeeID = ?, dateClosed = NOW() WHERE ticketID = ?';
    
    try {
        const [result] = await db.execute(sql1, [status, response, employeeID, id]);
        
        if (result.affectedRows === 0) {
            const sql2 = 'UPDATE tickets SET status = ?, employee_response = ?, employeeID = ?, dateClosed = NOW() WHERE ticketid = ?';
            const [result2] = await db.execute(sql2, [status, response, employeeID, id]);
            
            if (result2.affectedRows === 0) {
                return res.json({ success: false, message: "لم يتم العثور على التذكرة" });
            }
            res.json({ success: true });
        } else {
            res.json({ success: true });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/submit-report', async (req, res) => {
    const { employeeID, subject, content } = req.body;
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    const sql = 'INSERT INTO reports (employeeID, reportType, content, status, dateCreated) VALUES (?, ?, ?, ?, ?)';
    try {
        const [result] = await db.execute(sql, [employeeID, subject, content, 'جديد', date]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/reports', async (req, res) => {
    const sql = `SELECT r.*, e.name as empName FROM reports r JOIN employee e ON r.employeeID = e.employeeID ORDER BY r.dateCreated DESC`;
    try {
        const [r] = await db.query(sql);
        res.json(r || []);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/advertisements', async (req, res) => {
    try {
        const [r] = await db.query("SELECT * FROM advertisements ORDER BY dateCreated DESC");
        res.json(r || []);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/add-advertisement', async (req, res) => {
    const { title, content } = req.body;
    try {
        const [result] = await db.execute("INSERT INTO advertisements (title, content) VALUES (?, ?)", [title, content]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/delete-advertisement/:id', async (req, res) => {
    try {
        const [result] = await db.execute("DELETE FROM advertisements WHERE adID = ?", [req.params.id]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/tips', async (req, res) => {
    try {
        const [r] = await db.query("SELECT * FROM Tips ORDER BY dateCreated DESC");
        res.json(r || []);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/add-tip', async (req, res) => {
    const { content, employeeID } = req.body;
    try {
        const [result] = await db.execute("INSERT INTO Tips (content, employeeID) VALUES (?, ?)", [content, employeeID]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/delete-tip/:id', async (req, res) => {
    try {
        const [result] = await db.execute("DELETE FROM Tips WHERE tipID = ?", [req.params.id]);
        res.json({ success: result.affectedRows > 0 });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(port, async () => {
    console.log('Server running at http://localhost:' + port);
    
    try {
        await db.query('SELECT 1'); 
        console.log('✅ Connected to MySQL successfully!');
    } catch (err) {
        console.error('❌ Database connection failed!');
        console.error('Error details:', err.message);
    }
});



