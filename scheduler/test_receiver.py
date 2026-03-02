from flask import Flask, request

app = Flask(__name__)

@app.route("/api/test", methods=["POST"])
def test():
    print("Headers:", request.headers)
    print("Data:", request.get_data())
    print("JSON:", request.json)
    return {"status": "received"}, 200

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)