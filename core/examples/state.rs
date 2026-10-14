use lumen_core::transport::{ble::BleLink, Link};
#[tokio::main(flavor = "current_thread")]
async fn main() {
    let link = BleLink::new().await.unwrap();
    println!("powered = {:?}", link.powered().await);
}
